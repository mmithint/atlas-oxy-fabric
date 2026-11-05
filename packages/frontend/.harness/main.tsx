import { createRoot } from 'react-dom/client';

import App from '../src/App';
import { AuthContext, type AuthContextValue } from '../src/hooks/auth.context';
import { ThemeContext } from '../src/hooks/theme.context';
import { useAppTheme } from '../src/hooks/use-theme';
import '../src/global.css';

const auth = {
  session: { user: { id: 'u1', email: 'nitej.mithinti@bizmetric.com' }, isAuthenticated: true, isAnonymous: false },
  isAuthenticated: true, isLoading: false, canSignIn: true, signIn: async () => {}, isSigningIn: false,
  signInError: null, config: { kind: 'ready' }, error: null,
} as unknown as AuthContextValue;

function H() {
  const { isDark, toggleTheme } = useAppTheme();
  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <AuthContext.Provider value={auth}><App /></AuthContext.Provider>
    </ThemeContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<H />);
