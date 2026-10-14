import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, getIdentidad } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type Actividad = {
  id: string
  registro_id: string
  tipo: string
  resultado: string
  detalle: string
  fecha: string
  actor_id: string
}

type Tarea = {
  id: string
  registro_id: string
  titulo: string
  vence_at: string
  responsable_id: string
}

type Evento = {
  id: number
  registro_id: string
  accion: string
  actor_id: string
  entidad_id: string
  created_at: string
}

type Resumen = {
  actividades: Actividad[]
  tareas: Tarea[]
  eventos: Evento[]
}

const REGISTROS: Record<string, { id: string; nombre: string }[]> = {
  admin: [
    { id: "r1", nombre: "Prospecto ficticio Uno" },
    { id: "r2", nombre: "Prospecto ficticio Dos" },
    { id: "r4", nombre: "Prospecto ficticio Sin Asignar" },
  ],
  "asesor-a": [{ id: "r1", nombre: "Prospecto ficticio Uno" }],
  "asesor-b": [{ id: "r2", nombre: "Prospecto ficticio Dos" }],
  analista: [],
}

export function VistaCRM() {
  const identidad = getIdentidad()
  const registros = REGISTROS[identidad] ?? []
  const [registroId, setRegistroId] = useState<string | null>(registros[0]?.id ?? null)
  const [tipo, setTipo] = useState("llamada")
  const [resultado, setResultado] = useState("contactado")
  const [detalle, setDetalle] = useState("")
  const [proximaAccion, setProximaAccion] = useState("")
  const [venceAt, setVenceAt] = useState("")
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["crm", registroId],
    queryFn: () => api<Resumen>(`/crm/registros/${registroId}/resumen`),
    enabled: registroId !== null,
  })

  const mutarCrear = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { tipo, resultado, detalle }
      if (proximaAccion && venceAt) {
        body.proxima_accion = proximaAccion
        body.vence_at = new Date(venceAt).toISOString()
      }
      return api<{ actividad: Actividad; tarea: Tarea | null }>(
        `/crm/registros/${registroId}/actividades`,
        { method: "POST", body: JSON.stringify(body) },
      )
    },
    onSuccess: (r) => {
      toast.success(r.tarea ? "Actividad + tarea creadas" : "Actividad creada")
      setDetalle("")
      setProximaAccion("")
      setVenceAt("")
      queryClient.invalidateQueries({ queryKey: ["crm", registroId] })
    },
    onError: (e) => toast.error(e.message),
  })

  if (registros.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">CRM — Actividades</h1>
        <p className="text-muted-foreground">
          La identidad <Badge variant="outline">{identidad}</Badge> no tiene registros asignados.
          Cambia a admin, asesor-a o asesor-b.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">CRM — Actividades</h1>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Registro
          <Select value={registroId ?? ""} onValueChange={setRegistroId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {registros.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nombre} ({r.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva actividad</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Tipo
              <Select value={tipo} onValueChange={(v) => v && setTipo(v)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="llamada">Llamada</SelectItem>
                  <SelectItem value="correo">Correo</SelectItem>
                  <SelectItem value="reunion">Reunión</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Resultado
              <Select value={resultado} onValueChange={(v) => v && setResultado(v)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contactado">Contactado</SelectItem>
                  <SelectItem value="sin_respuesta">Sin respuesta</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Detalle *
            <Textarea
              placeholder="Resumen de la interacción..."
              value={detalle}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDetalle(e.target.value)}
              rows={3}
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Próxima acción (opcional)
              <Input
                placeholder="Confirmar envío"
                value={proximaAccion}
                onChange={(e) => setProximaAccion(e.target.value)}
                className="w-64"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Vence (requerido con próxima acción)
              <Input
                type="date"
                value={venceAt}
                onChange={(e) => setVenceAt(e.target.value)}
                className="w-40"
              />
            </label>
            <Button
              disabled={!detalle || mutarCrear.isPending}
              onClick={() => mutarCrear.mutate()}
            >
              {mutarCrear.isPending ? "Guardando..." : "Registrar actividad"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando resumen...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Actividades ({data?.actividades.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data?.actividades.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin actividades.</p>
              )}
              {data?.actividades.map((a) => (
                <div key={a.id} className="rounded-md border border-border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{a.tipo}</Badge>
                    <Badge variant={a.resultado === "contactado" ? "secondary" : "destructive"}>
                      {a.resultado}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs">{a.detalle}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.fecha} · {a.actor_id}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tareas ({data?.tareas.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data?.tareas.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin tareas.</p>
              )}
              {data?.tareas.map((t) => (
                <div key={t.id} className="rounded-md border border-border p-2 text-sm">
                  <p className="font-medium">{t.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    Vence {t.vence_at} · {t.responsable_id}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eventos ({data?.eventos.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data?.eventos.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin eventos.</p>
              )}
              {data?.eventos.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{e.accion}</Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {e.actor_id} · {e.created_at}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
