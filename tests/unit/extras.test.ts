import { describe, expect, it } from 'vitest';
import { acharMunicipio, normalizarConfigMunicipios, textoCompartilhar } from '../../src/ui/extras';
import { normalizarResultado } from '../../src/core/normalize';
import { ea20 } from '../fixtures/ea20';

describe('municípios', () => {
  const cfg = normalizarConfigMunicipios({ abr: [{ cd: 'PE', mu: [{ cd: '24376', nm: 'CARUARU', c: 'n' }, { cd: '25313', nm: 'RECIFE', c: 's' }, { cd: 'x', nm: 'INVALIDO' }] }] });
  it('lê a configuração oficial e descarta códigos inválidos', () => {
    expect(cfg.pe!.map((m) => m.nm)).toEqual(['CARUARU', 'RECIFE']);
    expect(cfg.pe![1]!.capital).toBe(true);
  });
  it('busca sem acento e sem diferenciar maiúsculas', () => {
    expect(acharMunicipio([{ cd: '1', nm: 'SÃO JOSÉ DO EGITO', capital: false }], 'sao jose do egito')?.cd).toBe('1');
    expect(acharMunicipio(cfg.pe!, 'olinda')).toBeNull();
  });
  it('rejeita configuração inválida', () => {
    expect(() => normalizarConfigMunicipios({})).toThrow();
  });
});

describe('compartilhar', () => {
  it('texto inclui fonte, horário oficial e aviso de parcial', () => {
    const r = normalizarResultado(ea20({ st: 250, ts: 1000, flavio: 40, lula: 60, ht: '19:31:22', dt: '25/10/2026' }), 'br');
    const t = textoCompartilhar(r, 'https://x');
    expect(t).toContain('totalização das 19:31');
    expect(t).toContain('25,00% das seções');
    expect(t).toContain('Lula 60,00% · Flávio Bolsonaro 40,00%');
    expect(t).toContain('Parcial — não é resultado final.');
    expect(t).toContain('Fonte: TSE');
  });
});
