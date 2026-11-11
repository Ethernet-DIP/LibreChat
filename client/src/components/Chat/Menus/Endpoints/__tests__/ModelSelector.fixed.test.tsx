import React from 'react';
import { render, screen } from '@testing-library/react';
import type { TStartupConfig } from 'librechat-data-provider';
import ModelSelector from '../ModelSelector';

jest.mock('../ModelSelectorChatContext', () => ({
  ModelSelectorChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../ModelSelectorContext', () => ({
  ModelSelectorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useModelSelectorContext: () => ({
    agentsMap: {},
    modelSpecs: [{ name: 'moe', label: 'MoE Teacher Assistant Agent' }],
    mappedEndpoints: [],
    endpointsConfig: {},
    selectedValues: { endpoint: 'agents', model: '', modelSpec: 'moe' },
    searchValue: '',
    searchResults: null,
    setSearchValue: jest.fn(),
    setSelectedValues: jest.fn(),
    keyDialogOpen: false,
    onOpenChange: jest.fn(),
    keyDialogEndpoint: null,
  }),
}));
jest.mock('../utils', () => ({
  getSelectedIcon: () => <img alt="logo" src="/assets/moe-logo.jpg" />,
  getDisplayValue: () => 'MoE Teacher Assistant Agent',
}));
jest.mock('../components', () => ({
  renderModelSpecs: () => null,
  renderEndpoints: () => null,
  renderCustomGroups: () => null,
  renderSearchResults: () => null,
}));
jest.mock('../CustomMenu', () => ({
  CustomMenu: ({ trigger }: { trigger: React.ReactNode }) => <div>{trigger}</div>,
}));
jest.mock('../DialogManager', () => () => null);
jest.mock('~/hooks/useKeyboardShortcuts', () => ({
  useShortcutHint: () => '',
  useShortcutAriaKey: () => '',
}));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

const config = (modelSelect: boolean, count: number) =>
  ({
    interface: { modelSelect },
    modelSpecs: { list: Array.from({ length: count }, (_, i) => ({ name: `s${i}` })) },
  }) as unknown as TStartupConfig;

describe('ModelSelector with one enforced spec', () => {
  it('shows the agent name and logo as a plain label, not a menu', () => {
    render(<ModelSelector startupConfig={config(false, 1)} />);
    expect(screen.getByTestId('model-selector-fixed')).toHaveTextContent(
      'MoE Teacher Assistant Agent',
    );
    expect(screen.getByAltText('logo')).toBeInTheDocument();
    expect(screen.queryByTestId('model-selector-button')).toBeNull();
  });

  it('keeps the menu when the picker is on', () => {
    render(<ModelSelector startupConfig={config(true, 1)} />);
    expect(screen.queryByTestId('model-selector-fixed')).toBeNull();
    expect(screen.getByTestId('model-selector-button')).toBeInTheDocument();
  });
});
