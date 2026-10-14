import { useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Pago = {
  id_pago: number
  fecha_pago: string
  valor_total: number
  operacion: string
  cedula_cliente: string | null
  nombre_cliente: string | null
  id_credito: number | null
  estado_credito: string | null
}

type RespuestaPagos = {
  items: Pago[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const LIMIT = 10

async function fetchPagos(
  filtros: { fechaInicio: string; fechaFin: string; cedula: string },
  extra: { page?: number; cursor?: string },
): Promise<{ data: RespuestaPagos; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: String(LIMIT) })
  if (extra.page) params.set("page", String(extra.page))
  if (extra.cursor) params.set("cursor", extra.cursor)
  if (filtros.fechaInicio) params.set("fecha_inicio", filtros.fechaInicio)
  if (filtros.fechaFin) params.set("fecha_fin", filtros.fechaFin)
  if (filtros.cedula) params.set("cedula_cliente", filtros.cedula)
  const r = await fetch(`/pagos/historial?${params}`, {
    headers: { "x-user": localStorage.getItem("user") ?? "admin" },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = (await r.json()) as RespuestaPagos
  return { data, nextCursor: r.headers.get("x-next-cursor") }
}

export function VistaPagos() {
  const [fechaInicio, setFechaInicio] = useState("")
  const [fechaFin, setFechaFin] = useState("")
  const [cedula, setCedula] = useState("")
  const [page, setPage] = useState(1)
  const [itemsCursor, setItemsCursor] = useState<Pago[]>([])
  const [siguienteCursor, setSiguienteCursor] = useState<string | null>(null)
  const [finCursor, setFinCursor] = useState(false)
  const [cargandoMas, setCargandoMas] = useState(false)

  const filtros = { fechaInicio, fechaFin, cedula }

  const { data, isLoading } = useQuery({
    queryKey: ["pagos", fechaInicio, fechaFin, cedula, page],
    queryFn: async () => {
      const r = await fetchPagos(filtros, { page })
      setSiguienteCursor(r.nextCursor)
      setFinCursor(!r.nextCursor)
      return r.data
    },
    placeholderData: keepPreviousData,
  })

  const reiniciar = () => {
    setPage(1)
    setItemsCursor([])
    setSiguienteCursor(null)
    setFinCursor(false)
  }

  const cambiarPagina = (nueva: number) => {
    setPage(nueva)
    setItemsCursor([])
    setSiguienteCursor(null)
    setFinCursor(false)
  }

  const cargarMas = async () => {
    if (!siguienteCursor) return
    setCargandoMas(true)
    try {
      const r = await fetchPagos(filtros, { cursor: siguienteCursor })
      setItemsCursor((prev) => [...prev, ...r.data.items])
      setSiguienteCursor(r.nextCursor)
      setFinCursor(!r.nextCursor)
    } finally {
      setCargandoMas(false)
    }
  }

  const filas = itemsCursor.length > 0 ? itemsCursor : data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Historial de pagos</h1>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Fecha inicio
          <Input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Fecha fin
          <Input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Cédula cliente
          <Input
            placeholder="DOC-A"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            className="w-36"
          />
        </label>
        <Button variant="outline" onClick={reiniciar}>
          Limpiar
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {total} pago{total === 1 ? "" : "s"} en total
      </p>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Crédito</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Estado crédito</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Sin pagos.
                    </TableCell>
                  </TableRow>
                )}
                {filas.map((p) => (
                  <TableRow key={p.id_pago}>
                    <TableCell className="font-mono text-xs">{p.id_pago}</TableCell>
                    <TableCell className="text-sm">{p.fecha_pago}</TableCell>
                    <TableCell className="text-sm">
                      {p.nombre_cliente ?? <span className="text-muted-foreground">—</span>}
                      {p.cedula_cliente && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({p.cedula_cliente})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.id_credito ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.operacion === "PAGO" ? "secondary" : "outline"}>
                        {p.operacion}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      ${p.valor_total.toLocaleString("es-CO")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.estado_credito ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => cambiarPagina(page - 1)}>
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {data?.page ?? 1} de {data?.totalPages ?? 1}
            </span>
            <Button
              variant="outline"
              disabled={(data?.page ?? 1) >= (data?.totalPages ?? 1)}
              onClick={() => cambiarPagina(page + 1)}
            >
              Siguiente
            </Button>
            <Button variant="secondary" disabled={cargandoMas || finCursor} onClick={cargarMas}>
              {cargandoMas ? "Cargando..." : finCursor ? "Fin" : "Cargar más (cursor)"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
