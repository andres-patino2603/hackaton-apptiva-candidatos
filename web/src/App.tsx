import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { VistaCiudades } from "@/views/Ciudades"
import { VistaPagos } from "@/views/Pagos"
import { VistaNotificaciones } from "@/views/Notificaciones"
import { VistaContactos } from "@/views/Contactos"
import { VistaCRM } from "@/views/CRM"
import { VistaInicio } from "@/views/Inicio"

const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<VistaInicio />} />
            <Route path="ciudades" element={<VistaCiudades />} />
            <Route path="pagos" element={<VistaPagos />} />
            <Route path="notificaciones" element={<VistaNotificaciones />} />
            <Route path="contactos" element={<VistaContactos />} />
            <Route path="crm" element={<VistaCRM />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
