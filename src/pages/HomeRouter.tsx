import { useAuth } from '../contexts/AuthContext';
import { Home } from './Home';
import { Homepage } from './Homepage';

export function HomeRouter() {
  const { user } = useAuth();
  if (user?.role === 'researcher') {
    return <Home />;
  }
  return <Homepage />;
}