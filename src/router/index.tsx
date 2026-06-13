import { createBrowserRouter, Navigate } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Account from '@/pages/Account'
import TopUp from '@/pages/TopUp'
import Withdrawal from '@/pages/Withdrawal'
import Nodes from '@/pages/Nodes'
import GenesisNodes from '@/pages/GenesisNodes'
import Generalization from '@/pages/Generalization'
import Points from '@/pages/Points'
import Airdrop from '@/pages/Airdrop'
import Staking from '@/pages/Staking'
import Dividend from '@/pages/Dividend'
import InvitePage from '@/pages/Invite'
import Download from '@/pages/Download'

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/account" replace /> },
      { path: 'account', element: <Account /> },
      { path: 'account/topup', element: <TopUp /> },
      { path: 'account/withdrawal', element: <Withdrawal /> },
      { path: 'nodes', element: <Nodes /> },
      { path: 'genesis-nodes', element: <GenesisNodes /> },
      { path: 'generalization', element: <Generalization /> },
      { path: 'team-level', element: <Navigate to="/nodes" replace /> },
      { path: 'points', element: <Points /> },
      { path: 'airdrop', element: <Airdrop /> },
      { path: 'staking', element: <Staking /> },
      { path: 'dividend', element: <Dividend /> },
      { path: 'ipo', element: <Navigate to="/airdrop" replace /> },
      { path: 'download', element: <Download /> },
      { path: 'invite/:code', element: <InvitePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/nodes" replace /> },
])

export default router
