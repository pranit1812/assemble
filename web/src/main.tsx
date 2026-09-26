import { createRoot } from 'react-dom/client';
import { Route, Switch } from 'wouter';
import './index.css';
import Home from './pages/Home';
import Admin from './pages/admin/Admin';
import Ops from './pages/ops/Ops';
import Sell from './pages/Sell';

createRoot(document.getElementById('root')!).render(
  <Switch>
    <Route path="/admin/*?" component={Admin} />
    <Route path="/ops/*?" component={Ops} />
    <Route path="/sell" component={Sell} />
    <Route component={Home} />
  </Switch>,
);
