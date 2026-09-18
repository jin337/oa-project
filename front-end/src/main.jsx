import '@arco-design/web-react/dist/css/arco.css'
import 'src/index.css'

import '@arco-design/web-react/es/_util/react-19-adapter'
import ReactDOM from 'react-dom/client'
import AppRouterProvider from 'src/router.jsx'
import { AuthProvider } from 'src/store/auth-context.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <AppRouterProvider />
  </AuthProvider>,
)
