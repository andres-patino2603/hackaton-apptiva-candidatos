// Caso 2: buscador de ciudades.
// Guia rapida:
// - normalize(): elimina tildes/marcas y pasa a minusculas.
// - GET '/': lee q y country; si vienen vacios, desactiva cada filtro.
// - Filtra todo el catalogo antes de aplicar slice(0, 20).
// - q busca por subcadena en ascii, country y countryCode.
// - country busca por subcadena en country y countryCode.
// - Si ambos filtros vienen, deben cumplirse (AND).
// - cities y sus objetos originales no se mutan.
import { Router } from 'express';
import { scalar } from '../http.js';
import { cities } from '../fixtures/cities.js';

// Normaliza texto para ignorar tildes y mayusculas en las comparaciones.
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function ciudadesRouter() {
  const router = Router();
  router.get('/', (req, res) => {
    const q = scalar(req.query.q);
    const country = scalar(req.query.country);

    const qFilter = q === '' ? null : normalize(q);
    const countryFilter = country === '' ? null : normalize(country);

    const filtered = cities.filter((city) => {
      if (qFilter) {
        const ascii = normalize(city.ascii);
        const itsCountry = normalize(city.country);
        const code = normalize(city.countryCode);
        if (!ascii.includes(qFilter) && !itsCountry.includes(qFilter) && !code.includes(qFilter)) return false;
      }
      if (countryFilter) {
        const itsCountry = normalize(city.country);
        const code = normalize(city.countryCode);
        if (!itsCountry.includes(countryFilter) && !code.includes(countryFilter)) return false;
      }
      return true;
    });

    res.json(filtered.slice(0, 20));
  });
  return router;
}
