import { createRoot } from 'react-dom/client';
import { Route, Switch } from 'wouter';
import './index.css';
import Home from './pages/Home';
import Admin from './pages/admin/Admin';
import Ops from './pages/ops/Ops';

createRoot(document.getElementById('root')!).render(
  <Switch>
    <Route path="/admin/*?" component={Admin} />
    <Route path="/ops/*?" component={Ops} />
    <Route component={Home} />
  </Switch>,
);
