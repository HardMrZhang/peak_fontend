import { createBrowserRouter, Navigate } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Films from '@/pages/Films'
import Account from '@/pages/Account'
import TopUp from '@/pages/TopUp'
import Withdrawal from '@/pages/Withdrawal'
import Nodes from '@/pages/Nodes'
import Generalization from '@/pages/Generalization'
import NodeTransaction from '@/pages/NodeTransaction'
import InvitePage from '@/pages/Invite'

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/nodes" replace /> },
      { path: 'films', element: <Films /> },
      { path: 'account', element: <Account /> },
      { path: 'account/topup', element: <TopUp /> },
      { path: 'account/withdrawal', element: <Withdrawal /> },
      { path: 'nodes', element: <Nodes /> },
      { path: 'node-transaction', element: <NodeTransaction /> },
      { path: 'generalization', element: <Generalization /> },
      { path: 'invite/:code', element: <InvitePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/nodes" replace /> },
])

export default router
