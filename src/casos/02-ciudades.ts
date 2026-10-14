import { Router } from 'express';
import { scalar } from '../http.js';
import { cities } from '../fixtures/cities.js';

// Quita mayúsculas y tildes: "LÚMINA" -> "lumina".
// NFD separa cada letra de su tilde, y luego se borran las tildes sueltas.
const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const LIMITE = 20;

export function ciudadesRouter() {
  const router = Router();
  router.get('/', (req, res) => {
    // Ausente o vacío = filtro desactivado
    const q = normalizar(scalar(req.query.q) ?? '');
    const country = normalizar(scalar(req.query.country) ?? '');

    const resultado = cities
      .filter(c => {
        const coincideQ =
          !q ||
          [c.ascii, c.country, c.countryCode].some(v => normalizar(v).includes(q));
        const coincidePais =
          !country ||
          [c.country, c.countryCode].some(v => normalizar(v).includes(country));
        return coincideQ && coincidePais; // ambos deben cumplirse
      })
      .slice(0, LIMITE); // primero filtrar, después limitar

    res.json(resultado);
  });
  return router;
}