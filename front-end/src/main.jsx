import '@arco-design/web-react/dist/css/arco.css'
import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { router, RouterProvider } from './router.jsx'
import { AuthProvider } from './store/auth-context.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
)
