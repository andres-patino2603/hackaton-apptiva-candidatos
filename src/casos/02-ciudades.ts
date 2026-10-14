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
    const q = normalize(scalar(req.query.q)), country = normalize(scalar(req.query.country));
    res.json(cities.filter(c =>
      (!q || normalize(c.ascii).includes(q) || normalize(c.country).includes(q) || normalize(c.countryCode).includes(q))
      && (!country || normalize(c.country).includes(country) || normalize(c.countryCode).includes(country))
    ).slice(0, 20));
  });
  return router;
}
