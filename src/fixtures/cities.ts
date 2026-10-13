// Topónimos ficticios en orden de catálogo. No se copia cities.json de Apptiva.
export const cities = [
  { id: 'city-1', ascii: 'Lumina', city: 'Lúmina', country: 'País Ámbar', countryCode: 'AM' },
  { id: 'city-2', ascii: 'Puerto Azul', city: 'Puerto Azul', country: 'País Boreal', countryCode: 'BO' },
  ...Array.from({ length: 23 }, (_, i) => ({ id: `city-${i + 3}`, ascii: `Villa ${String(i + 1).padStart(2, '0')}`, city: `Villa ${String(i + 1).padStart(2, '0')}`, country: 'País Ámbar', countryCode: 'AM' })),
  { id: 'city-26', ascii: 'Ultima', city: 'Última', country: 'País Boreal', countryCode: 'BO' },
];
