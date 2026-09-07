import { PLACES, filterPlaces, normalizeForSearch, type Place } from '../places';

describe('normalizeForSearch', () => {
  it('Türkçe büyük İ ve I harflerini doğru küçültür', () => {
    expect(normalizeForSearch('GİRNE')).toBe('girne');
    expect(normalizeForSearch('ISKELE')).toBe('iskele');
  });

  it('Türkçe harfleri ASCII karşılığına indirger', () => {
    expect(normalizeForSearch('Güzelyurt Şöför Çığ')).toBe('guzelyurt sofor cig');
  });
});

describe('filterPlaces', () => {
  it("'ercan' → Ercan Havalimanı", () => {
    expect(filterPlaces('ercan').map((p) => p.name)).toEqual(['Ercan Havalimanı']);
  });

  it("'GİRNE' Girne'deki yerleri ve adında Girne geçenleri bulur", () => {
    const names = filterPlaces('GİRNE').map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Girne Limanı',
        'Girne Amerikan Üniversitesi',
        'Bellapais Manastırı',
        'Alsancak Merkez',
        'Girne Kapısı',
      ]),
    );
    expect(names).toHaveLength(5);
    expect(names).not.toContain('Ercan Havalimanı');
  });

  it('İngilizce klavyeyle yazılan sorgu Türkçe adları bulur', () => {
    expect(filterPlaces('guzelyurt').map((p) => p.name)).toEqual(['Güzelyurt Merkez']);
    expect(filterPlaces('ISKELE').map((p) => p.name)).toEqual(['İskele Long Beach']);
    expect(filterPlaces('lefkosa').length).toBeGreaterThan(0);
  });

  it('boş ya da yalnızca boşluk sorguda tüm listeyi döner', () => {
    expect(filterPlaces('')).toHaveLength(PLACES.length);
    expect(filterPlaces('   ')).toHaveLength(PLACES.length);
  });

  it('eşleşme yoksa boş liste döner', () => {
    expect(filterPlaces('xyz')).toEqual([]);
  });

  it('verilen liste üzerinde çalışır ve kaynağı değiştirmez', () => {
    const custom: Place[] = [
      { name: 'Test Yeri', city: 'Lefke', country: 'KKTC', lat: 0, lng: 0 },
      { name: 'Başka', city: 'Girne', country: 'KKTC', lat: 0, lng: 0 },
    ];
    expect(filterPlaces('lefke', custom)).toEqual([custom[0]]);
    expect(filterPlaces('', custom)).not.toBe(custom);
    expect(custom).toHaveLength(2);
  });
});
