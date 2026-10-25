/**
 * Orquestra a consulta periódica: sem chamadas sobrepostas, com backoff em falhas,
 * preservando sempre o último dado válido e registrando o horário de cada sucesso.
 */
import {
  ABRANGENCIA_EXTERIOR, BASE_DADOS, INTERVALO_SEGUNDOS, LIMITE_DESATUALIZADO_MS, TIMEOUT_MS, UFS,
  caminhoAcompanhamento, caminhoResultado,
} from '../config';
import { normalizarAcompanhamento, normalizarResultado } from '../core/normalize';
import type { Acompanhamento, Resultado } from '../core/types';
import { buscarJson, emLotes, type ErroBusca, type FetchLike } from './fetcher';

export interface Entrada<T> {
  dados: T | null;
  /** Instante (relógio local) da última consulta bem-sucedida. */
  consultadoEm: number | null;
  ultimoErro: ErroBusca | null;
}

export interface PontoHistorico {
  registradoEm: string;
  totalizadoEm: string;
  pctTotalizadas: number;
  percentuais: Record<string, number | null>;
}

export interface Estado {
  nacional: Entrada<Resultado>;
  acompanhamento: Entrada<Acompanhamento>;
  abrangencias: Record<string, Entrada<Resultado>>;
  historico: PontoHistorico[] | null;
  ciclos: number;
  consultando: boolean;
  falhasSeguidas: number;
  proximaConsultaEm: number | null;
}

const vazia = <T>(): Entrada<T> => ({ dados: null, consultadoEm: null, ultimoErro: null });

export const ABRANGENCIAS_UF: readonly string[] = [...UFS, ABRANGENCIA_EXTERIOR];

export interface OpcoesStore {
  base?: string;
  fetchImpl?: FetchLike;
  intervaloMs?: number;
  agora?: () => number;
  log?: (evento: string, dados: Record<string, unknown>) => void;
}

export class Store {
  estado: Estado = {
    nacional: vazia(),
    acompanhamento: vazia(),
    abrangencias: Object.fromEntries(ABRANGENCIAS_UF.map((u) => [u, vazia<Resultado>()])),
    historico: null,
    ciclos: 0,
    consultando: false,
    falhasSeguidas: 0,
    proximaConsultaEm: null,
  };
  private ouvintes = new Set<(e: Estado, mudou: boolean) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private emVoo: Promise<void> | null = null;
  private parado = true;
  private readonly base: string;
  private readonly intervaloMs: number;
  private readonly agora: () => number;
  private readonly fetchImpl?: FetchLike;
  private readonly log: (evento: string, dados: Record<string, unknown>) => void;

  constructor(opts: OpcoesStore = {}) {
    this.base = opts.base ?? BASE_DADOS;
    this.intervaloMs = opts.intervaloMs ?? INTERVALO_SEGUNDOS * 1000;
    this.agora = opts.agora ?? Date.now;
    this.fetchImpl = opts.fetchImpl;
    this.log = opts.log ?? ((ev, d) => console.info(`[URNA360] ${ev}`, d));
  }

  assinar(fn: (e: Estado, mudou: boolean) => void): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  private emitir(mudou: boolean) {
    for (const fn of this.ouvintes) fn(this.estado, mudou);
  }

  iniciar() {
    if (!this.parado) return;
    this.parado = false;
    void this.consultarAgora();
  }

  parar() {
    this.parado = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Se já houver uma consulta em andamento, reutiliza-a (nunca duplica). */
  consultarAgora(): Promise<void> {
    if (this.emVoo) return this.emVoo;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.emVoo = this.ciclo().finally(() => {
      this.emVoo = null;
      this.agendar();
    });
    return this.emVoo;
  }

  private agendar() {
    if (this.parado) return;
    const fator = Math.min(2 ** this.estado.falhasSeguidas, 10);
    const espera = Math.min(this.intervaloMs * fator, 5 * 60_000);
    this.estado.proximaConsultaEm = this.agora() + espera;
    this.timer = setTimeout(() => void this.consultarAgora(), espera);
    this.emitir(false);
  }

  private url(caminho: string) {
    return `${this.base}${caminho}`;
  }

  private async ciclo(): Promise<void> {
    this.estado.consultando = true;
    this.emitir(false);
    let mudou = false;
    const opts = { timeoutMs: TIMEOUT_MS, fetchImpl: this.fetchImpl, agora: this.agora };

    const [nac, acomp] = await Promise.all([
      buscarJson(this.url(caminhoResultado('br')), (r) => normalizarResultado(r, 'br'), opts),
      buscarJson(this.url(caminhoAcompanhamento()), normalizarAcompanhamento, opts),
    ]);
    this.log('consulta', { arquivo: 'br-u', ok: nac.ok, ms: nac.duracaoMs, erro: nac.ok ? undefined : nac.erro.tipo });
    this.log('consulta', { arquivo: 'br-ab', ok: acomp.ok, ms: acomp.duracaoMs, erro: acomp.ok ? undefined : acomp.erro.tipo });

    if (nac.ok) mudou = this.aplicar(this.estado.nacional, nac.dados) || mudou;
    else this.estado.nacional.ultimoErro = nac.erro;
    if (acomp.ok) {
      const antes = this.estado.acompanhamento.dados?.geradoEm?.texto;
      this.estado.acompanhamento = { dados: acomp.dados, consultadoEm: this.agora(), ultimoErro: null };
      mudou = mudou || antes !== acomp.dados.geradoEm?.texto;
    } else this.estado.acompanhamento.ultimoErro = acomp.erro;

    // Só baixa a UF quando o acompanhamento indica nova totalização (ou quando ainda não temos dados).
    const pendentes = ABRANGENCIAS_UF.filter((uf) => this.precisaAtualizar(uf));
    const res = await emLotes(pendentes, 6, (uf) =>
      buscarJson(this.url(caminhoResultado(uf as never)), (r) => normalizarResultado(r, uf), opts).then((b) => ({ uf, b })),
    );
    let falhasUf = 0;
    for (const { uf, b } of res) {
      const entrada = this.estado.abrangencias[uf]!;
      if (b.ok) mudou = this.aplicar(entrada, b.dados) || mudou;
      else {
        entrada.ultimoErro = b.erro;
        falhasUf++;
      }
    }
    if (pendentes.length) this.log('consulta', { arquivo: 'uf-u', total: pendentes.length, falhas: falhasUf });

    await this.buscarHistorico();

    const falhouTudo = !nac.ok && !acomp.ok;
    this.estado.falhasSeguidas = falhouTudo ? this.estado.falhasSeguidas + 1 : 0;
    this.estado.ciclos++;
    this.estado.consultando = false;
    this.emitir(mudou);
  }

  private precisaAtualizar(uf: string): boolean {
    const atual = this.estado.abrangencias[uf];
    if (!atual?.dados) return true;
    const acomp = this.estado.acompanhamento.dados;
    if (!acomp) return true; // sem sinal de mudança: revalida (o navegador usa ETag/304)
    const item = acomp.abrangencias.find((a) => a.abrangencia === uf);
    if (!item) return false;
    return (item.totalizadoEm?.texto ?? '') !== (atual.dados.totalizadoEm?.texto ?? '') || item.andamento !== atual.dados.andamento;
  }

  /** Aplica um dado válido; retorna true se houve mudança real (evita animar o que não mudou). */
  private aplicar(entrada: Entrada<Resultado>, dados: Resultado): boolean {
    const anterior = entrada.dados;
    const igual =
      anterior !== null &&
      anterior.geradoEm?.texto === dados.geradoEm?.texto &&
      anterior.idGeracao === dados.idGeracao &&
      anterior.totalizadoEm?.texto === dados.totalizadoEm?.texto;
    entrada.consultadoEm = this.agora();
    entrada.ultimoErro = null;
    if (igual) return false;
    // Não aceita um arquivo mais antigo que o já exibido (CDN pode servir versões fora de ordem).
    if (anterior?.geradoEm && dados.geradoEm && dados.geradoEm.ms < anterior.geradoEm.ms) {
      this.log('arquivo_antigo_ignorado', { abrangencia: dados.abrangencia });
      return false;
    }
    entrada.dados = dados;
    return true;
  }

  private async buscarHistorico() {
    if (!this.base.startsWith('/api/')) return; // histórico só existe com o proxy próprio
    try {
      const f = this.fetchImpl ?? ((i: string, init?: RequestInit) => fetch(i, init));
      const r = await f('/api/historico', { cache: 'no-cache' });
      if (!r.ok) return;
      const j: unknown = await r.json();
      if (Array.isArray(j)) this.estado.historico = j as PontoHistorico[];
    } catch {
      /* histórico é opcional */
    }
  }

  desatualizado(entrada: Entrada<unknown>): boolean {
    return entrada.consultadoEm === null || this.agora() - entrada.consultadoEm > LIMITE_DESATUALIZADO_MS;
  }
}
