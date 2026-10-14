import { Router } from 'express';
import { scalar } from '../http.js';
import { cities } from '../fixtures/cities.js';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
// CASO 2: el buscador tiene regresiones intencionales. Restablece el contrato.
export function ciudadesRouter() {
  const router = Router();
  router.get('/', (req, res) => {
        const q = norm(scalar(req.query.q)), country = norm(scalar(req.query.country));
    res.json(cities.filter(c => {
      const nombre = norm(c.ascii), pais = norm(c.country), codigo = norm(c.countryCode);
      return (!q || nombre.includes(q) || pais.includes(q) || codigo.includes(q))
          && (!country || pais.includes(country) || codigo.includes(country));
    }).slice(0, 20));
  });
  return router;
}
