// Copyright 2017-2020 @polkadot/app-accounts authors & contributors
// This software may be modified and distributed under the terms
// of the Apache-2.0 license. See the LICENSE file for details.

import { KeyringAddress } from '@polkadot/ui-keyring/types';
import { ComponentProps as Props } from '../types';
import { SortedAccount } from './types';

import BN from 'bn.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import keyring from '@polkadot/ui-keyring';
import { getLedger, isLedger } from '@polkadot/react-api';
import { useApi, useAccounts, useFavorites, useIpfs, useToggle } from '@polkadot/react-hooks';
import { FormatBalance } from '@polkadot/react-query';
import { Button, Input, Table } from '@polkadot/react-components';
import { BN_ZERO } from '@polkadot/util';

import { useTranslation } from '../translate';
import CreateModal from './modals/Create';
import ImportModal from './modals/Import';
import Multisig from './modals/MultisigCreate';
import Proxy from './modals/ProxyAdd';
import Qr from './modals/Qr';
import Account from './Account';
import BannerClaims from './BannerClaims';
import BannerExtension from './BannerExtension';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { injectMetamaskPolkadotSnapProvider } from '@nodefactory/metamask-polkadot-adapter/';
import { Keyring } from '@polkadot/keyring';
import settings from '@polkadot/ui-settings';

interface Balances {
  accounts: Record<string, BN>;
  balanceTotal?: BN;
}

async function queryMetamask (): Promise<void> {
  await web3Enable('polkadot-js/apps');
  const metamaskExtension = await web3FromSource('metamask-polkadot-snap');

  if (metamaskExtension) {
    (await metamaskExtension.accounts.get()).forEach((account) => {
      const accountKeyring = new Keyring();
      const keyringPair = accountKeyring.addFromAddress(account.address, {
        isInjected: true, source: 'metamask-polkadot-snap', tags: ['metamask']
      });

      keyring.saveAccount(keyringPair);
    }
    );
  }
}


const STORE_FAVS = 'accounts:favorites';

// query the ledger for the address, adding it to the keyring
async function queryLedger (): Promise<void> {
  const ledger = getLedger();

  try {
    const { address } = await ledger.getAddress();

    keyring.addHardware(address, 'ledger', { name: 'ledger' });
  } catch (error) {
    console.error(error);
  }
}

function expandList (mapped: SortedAccount[], entry: SortedAccount): SortedAccount[] {
  mapped.push(entry);

  entry.children.forEach((entry): void => {
    expandList(mapped, entry);
  });

  return mapped;
}

function sortAccounts (addresses: string[], favorites: string[]): SortedAccount[] {
  const mapped = addresses
    .map((address) => keyring.getAccount(address))
    .filter((account): account is KeyringAddress => !!account)
    .map((account): SortedAccount => ({
      account,
      children: [],
      isFavorite: favorites.includes(account.address)
    }))
    .sort((a, b) => (a.account.meta.whenCreated || 0) - (b.account.meta.whenCreated || 0));

  return mapped
    .filter((entry): boolean => {
      const parentAddress = entry.account.meta.parentAddress;

      if (parentAddress) {
        const parent = mapped.find(({ account: { address } }) => address === parentAddress);

        if (parent) {
          parent.children.push(entry);

          return false;
        }
      }

      return true;
    })
    .reduce(expandList, [])
    .sort((a, b): number =>
      a.isFavorite === b.isFavorite
        ? 0
        : b.isFavorite
          ? 1
          : -1
    );
}

function Overview ({ className = '', onStatusChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { api } = useApi();
  const { allAccounts } = useAccounts();
  const { isIpfs } = useIpfs();
  const [isCreateOpen, toggleCreate] = useToggle();
  const [isImportOpen, toggleImport] = useToggle();
  const [isMultisigOpen, toggleMultisig] = useToggle();
  const [isProxyOpen, toggleProxy] = useToggle();
  const [isQrOpen, toggleQr] = useToggle();
  const [favorites, toggleFavorite] = useFavorites(STORE_FAVS);
  const [{ balanceTotal }, setBalances] = useState<Balances>({ accounts: {} });
  const [sortedAccounts, setSortedAccounts] = useState<SortedAccount[]>([]);
  const [filterOn, setFilter] = useState<string>('');

  useEffect((): void => {
    setSortedAccounts(
      sortAccounts(allAccounts, favorites)
    );
  }, [allAccounts, favorites]);

  const _setBalance = useCallback(
    (account: string, balance: BN) =>
      setBalances(({ accounts }: Balances): Balances => {
        accounts[account] = balance;

        return {
          accounts,
          balanceTotal: Object.values(accounts).reduce((total: BN, value: BN) => total.add(value), BN_ZERO)
        };
      }),
    []
  );

  const header = useMemo(() => [
    [t('accounts'), 'start', 3],
    [t('parent'), 'address'],
    [t('type')],
    [t('tags'), 'start'],
    [t('transactions'), 'ui--media-1500'],
    [t('balances')],
    [],
    [undefined, 'mini ui--media-1400']
  ], [t]);

  const footer = useMemo(() => (
    <tr>
      <td colSpan={7} />
      <td className='number'>
        {balanceTotal && <FormatBalance value={balanceTotal} />}
      </td>
      <td colSpan={2} />
    </tr>
  ), [balanceTotal]);

  const filter = useMemo(() => (
    <div className='filter--tags'>
      <Input
        autoFocus
        isFull
        label={t<string>('filter by name or tags')}
        onChange={setFilter}
        value={filterOn}
      />
    </div>
  ), [filterOn, t]);

  const connectMetamaskAccount = (): void => {
    injectMetamaskPolkadotSnapProvider(settings.apiUrl.includes('kusama') ? 'kusama' : 'westend');
    queryMetamask();
  };

  return (
    <div className={className}>
      <BannerExtension />
      <BannerClaims />
      {isCreateOpen && (
        <CreateModal
          onClose={toggleCreate}
          onStatusChange={onStatusChange}
        />
      )}
      {isImportOpen && (
        <ImportModal
          onClose={toggleImport}
          onStatusChange={onStatusChange}
        />
      )}
      {isMultisigOpen && (
        <Multisig
          onClose={toggleMultisig}
          onStatusChange={onStatusChange}
        />
      )}
      {isProxyOpen && (
        <Proxy
          onClose={toggleProxy}
          onStatusChange={onStatusChange}
        />
      )}
      {isQrOpen && (
        <Qr
          onClose={toggleQr}
          onStatusChange={onStatusChange}
        />
      )}
      <Button.Group>
        <Button
          icon='add'
          isDisabled={isIpfs}
          label={t<string>('Add account')}
          onClick={toggleCreate}
        />
        <Button
          icon='sync'
          isDisabled={isIpfs}
          label={t<string>('Restore JSON')}
          onClick={toggleImport}
        />
        <Button
          icon='qrcode'
          label={t<string>('Add via Qr')}
          onClick={toggleQr}
        />
        {isLedger() && (
          <>
            <Button
              icon='question'
              label={t<string>('Query Ledger')}
              onClick={queryLedger}
            />
          </>
        )}
        <Button
          icon='add'
          isDisabled={!api.tx.multisig && api.tx.utility}
          label={t<string>('Multisig')}
          onClick={toggleMultisig}
        />
        <Button
          icon='add'
          label={t('Connect Metamask')}
          onClick={connectMetamaskAccount}
        />
        <Button
          icon='add'
          isDisabled={!api.tx.proxy}
          label={t<string>('Proxied')}
          onClick={toggleProxy}
        />
      </Button.Group>
      <Table
        empty={t<string>("You don't have any accounts. Some features are currently hidden and will only become available once you have accounts.")}
        filter={filter}
        footer={footer}
        header={header}
      >
        {sortedAccounts.map(({ account, isFavorite }): React.ReactNode => (
          <Account
            account={account}
            filter={filterOn}
            isFavorite={isFavorite}
            key={account.address}
            setBalance={_setBalance}
            toggleFavorite={toggleFavorite}
          />
        ))}
      </Table>
    </div>
  );
}

export default React.memo(styled(Overview)`
  .filter--tags {
    .ui--Dropdown {
      padding-left: 0;

      label {
        left: 1.55rem;
      }
    }
  }
`);
