import { Router } from 'express';
import { scalar } from '../http.js';
import { cities } from '../fixtures/cities.js';

// Normaliza un texto: minúsculas + elimina tildes (NFD + strip combining chars)
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

// CASO 2: correcciones aplicadas:
// 1. slice(0,20) movido al final para no cortar antes de filtrar
// 2. || cambiado a && para que ambos filtros deban cumplirse cuando se envían juntos
// 3. Normalización NFD en q y country para ignorar mayúsculas y tildes
export function ciudadesRouter() {
  const router = Router();
  router.get('/', (req, res) => {
    const q       = scalar(req.query.q);
    const country = scalar(req.query.country);

    const nq       = q       ? normalize(q)       : '';
    const ncountry = country ? normalize(country) : '';

    const result = cities
      .filter(c => {
        // filtro q: subcadena en ascii, country o countryCode
        const matchQ = !nq || (
          normalize(c.ascii).includes(nq) ||
          normalize(c.country).includes(nq) ||
          normalize(c.countryCode).includes(nq)
        );

        // filtro country: subcadena en country o countryCode
        const matchCountry = !ncountry || (
          normalize(c.country).includes(ncountry) ||
          normalize(c.countryCode).includes(ncountry)
        );

        // ambos deben cumplirse si están presentes
        return matchQ && matchCountry;
      })
      .slice(0, 20); // límite de 20 aplicado DESPUÉS de filtrar

    res.json(result);
  });
  return router;
}
