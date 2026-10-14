import { Router } from 'express';
import { scalar } from '../http.js';
import { cities } from '../fixtures/cities.js';
// CASO 2: el buscador tiene regresiones intencionales. Restablece el contrato.
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
export function ciudadesRouter() {
  const router = Router();
  router.get('/', (req, res) => {
    const q = scalar(req.query.q), country = scalar(req.query.country);
    res.json(cities.slice(0, 20).filter(c =>
      (!q || c.ascii.includes(q)) || (!country || c.countryCode === country)
    ));
  });
  return router;
}
