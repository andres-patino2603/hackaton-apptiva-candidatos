import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, getIdentidad } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Contacto = {
  id: string
  id_agencia: number
  nombre_completo: string
  correo: string | null
  telefono: string | null
  deleted_at: string | null
}

type ListaContactos = {
  items: Contacto[]
  total: number
  page: number
  limit: number
}

const AGENCIAS: Record<string, number[]> = {
  admin: [1, 2],
  "asesor-a": [1],
  "asesor-b": [2],
  analista: [],
}

function agenciasDe(identidad: string): number[] {
  return AGENCIAS[identidad] ?? []
}

export function VistaContactos() {
  const identidad = getIdentidad()
  const opciones = agenciasDe(identidad)
  const [agencia, setAgencia] = useState<number | null>(opciones[0] ?? null)
  const [vista, setVista] = useState<"activos" | "eliminados">("activos")
  const [search, setSearch] = useState("")
  const [dialogo, setDialogo] = useState<"crear" | "editar" | null>(null)
  const [editando, setEditando] = useState<Contacto | null>(null)
  const [nombre, setNombre] = useState("")
  const [correo, setCorreo] = useState("")
  const [telefono, setTelefono] = useState("")
  const [historial, setHistorial] = useState<{ contacto: Contacto; eventos: unknown[] } | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["contactos", agencia, vista, search],
    queryFn: () => {
      const params = new URLSearchParams({ vista, limit: "100" })
      if (search) params.set("search", search)
      return api<ListaContactos>(`/agencias/${agencia}/asesores?${params}`)
    },
    enabled: agencia !== null,
  })

  const { data: eventos } = useQuery({
    queryKey: ["historial", agencia, historial?.contacto.id],
    queryFn: () => api<unknown[]>(`/agencias/${agencia}/asesores/${historial?.contacto.id}/historial`),
    enabled: historial !== null && agencia !== null,
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["contactos"] })

  const abrirCrear = () => {
    setDialogo("crear")
    setEditando(null)
    setNombre("")
    setCorreo("")
    setTelefono("")
  }

  const abrirEditar = (c: Contacto) => {
    setDialogo("editar")
    setEditando(c)
    setNombre(c.nombre_completo)
    setCorreo(c.correo ?? "")
    setTelefono(c.telefono ?? "")
  }

  const mutarGuardar = useMutation({
    mutationFn: async () => {
      const body = {
        nombre_completo: nombre,
        correo: correo || null,
        telefono: telefono || null,
      }
      if (dialogo === "crear") return api(`/agencias/${agencia}/asesores`, { method: "POST", body: JSON.stringify(body) })
      return api(`/agencias/${agencia}/asesores/${editando?.id}`, { method: "PATCH", body: JSON.stringify(body) })
    },
    onSuccess: () => {
      toast.success(dialogo === "crear" ? "Contacto creado" : "Contacto actualizado")
      setDialogo(null)
      invalidar()
    },
    onError: (e) => toast.error(e.message),
  })

  const mutarBaja = useMutation({
    mutationFn: (id: string) => api(`/agencias/${agencia}/asesores/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Contacto dado de baja")
      invalidar()
    },
    onError: (e) => toast.error(e.message),
  })

  const mutarRestaurar = useMutation({
    mutationFn: (id: string) => api(`/agencias/${agencia}/asesores/${id}/restaurar`, { method: "PATCH" }),
    onSuccess: () => {
      toast.success("Contacto restaurado")
      invalidar()
    },
    onError: (e) => toast.error(e.message),
  })

  if (opciones.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Directorio de contactos</h1>
        <p className="text-muted-foreground">
          La identidad <Badge variant="outline">{identidad}</Badge> no tiene agencias asignadas.
          Cambia a admin, asesor-a o asesor-b.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Directorio de contactos</h1>
        <Button onClick={abrirCrear} disabled={agencia === null}>
          Nuevo contacto
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Agencia
          <select
            value={agencia ?? ""}
            onChange={(e) => setAgencia(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {opciones.map((id) => (
              <option key={id} value={id}>
                Agencia {id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Buscar
          <Input
            placeholder="Nombre, correo o teléfono"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
        </label>
      </div>

      <Tabs value={vista} onValueChange={(v) => setVista(v as "activos" | "eliminados")}>
        <TabsList>
          <TabsTrigger value="activos">Activos</TabsTrigger>
          <TabsTrigger value="eliminados">Eliminados</TabsTrigger>
        </TabsList>
        <TabsContent value={vista}>
          {isLoading ? (
            <p className="text-muted-foreground">Cargando...</p>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Sin contactos.
                      </TableCell>
                    </TableRow>
                  )}
                  {data?.items.map((c) => (
                    <TableRow key={c.id} className={c.deleted_at ? "opacity-60" : ""}>
                      <TableCell className="text-sm font-medium">{c.nombre_completo}</TableCell>
                      <TableCell className="text-sm">{c.correo ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.telefono ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={c.deleted_at ? "destructive" : "secondary"}>
                          {c.deleted_at ? "Baja" : "Activo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!c.deleted_at && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => abrirEditar(c)}>
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={mutarBaja.isPending}
                                onClick={() => mutarBaja.mutate(c.id)}
                              >
                                Baja
                              </Button>
                            </>
                          )}
                          {c.deleted_at && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={mutarRestaurar.isPending}
                              onClick={() => mutarRestaurar.mutate(c.id)}
                            >
                              Restaurar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setHistorial({ contacto: c, eventos: [] })}
                          >
                            Historial
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogo !== null} onOpenChange={(open) => !open && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogo === "crear" ? "Nuevo contacto" : "Editar contacto"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Nombre completo *
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Correo
              <Input value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Teléfono
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button disabled={!nombre || mutarGuardar.isPending} onClick={() => mutarGuardar.mutate()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historial !== null} onOpenChange={(open) => !open && setHistorial(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial — {historial?.contacto.nombre_completo}</DialogTitle>
          </DialogHeader>
          {eventos === undefined ? (
            <p className="text-muted-foreground">Cargando...</p>
          ) : eventos.length === 0 ? (
            <p className="text-muted-foreground">Sin eventos.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(eventos as { id: number; accion: string; actor_id: string; created_at: string }[]).map((e) => (
                <div key={e.id} className="rounded-md border border-border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{e.accion}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {e.actor_id} · {e.created_at}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
