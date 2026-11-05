import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '@/hooks/auth.context';

import { fixture } from './test/atlas-fixture';

vi.mock('@microsoft/fabric-visuals', () => ({
  VegaVisual: () => null,
  useCssTheme: () => ({}),
}));
vi.mock('@/atlas/source', () => ({
  loadEquipment: vi.fn(async () => fixture().equipment),
  loadAliases: vi.fn(async () => fixture().aliases),
}));
vi.mock('@/atlas/repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/atlas/repo')>();
  return {
    ...actual,
    seedIfEmpty: vi.fn(async () => false),
    listRequests: vi.fn(async () => fixture().requests),
    listRules: vi.fn(async () => fixture().rules),
    listApprovers: vi.fn(async () => fixture().approvers),
    listAudit: vi.fn(async () => []),
    listViolations: vi.fn(async () => []),
    listEvidence: vi.fn(async () => []),
  };
});

import App from '@/App';

const auth = {
  session: { user: { id: 'u1', email: 'tester@example.com' }, isAuthenticated: true, isAnonymous: false },
  isAuthenticated: true,
  isLoading: false,
  canSignIn: true,
  signIn: async () => {},
  isSigningIn: false,
  signInError: null,
  config: { kind: 'ready' },
  error: null,
} as unknown as AuthContextValue;

function renderApp(hash = '') {
  window.location.hash = hash;
  return render(
    <AuthContext.Provider value={auth}>
      <App />
    </AuthContext.Provider>
  );
}

describe('ATLAS app', () => {
  it('shows the overview with KPIs from Gold and app data', async () => {
    renderApp('#/overview');
    expect(await screen.findByRole('heading', { name: 'Equipment data health' })).toBeVisible();
    expect(screen.getByText('48')).toBeVisible();
  });

  it('opens an equipment record with its identity cross-reference', async () => {
    renderApp('#/equipment/10412301');
    expect(await screen.findByText('Identity cross-reference')).toBeVisible();
    expect(screen.getAllByText('Unit 3507').length).toBeGreaterThan(0);
  });

  it('shows the approval review with data-quality impact', async () => {
    renderApp('#/approvals/CR-01041');
    expect(await screen.findByText(/CR-01041 · Heat duty/)).toBeVisible();
    expect(screen.getByText(/Clears HTR_02/)).toBeVisible();
  });
});
