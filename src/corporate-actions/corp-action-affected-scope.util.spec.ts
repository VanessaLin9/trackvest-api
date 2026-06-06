import { toAffectedScopes } from './corp-action-affected-scope.util'

describe('corp-action-affected-scope.util', () => {
  it('maps transaction rows into account-asset replay scopes', () => {
    expect(
      toAffectedScopes([
        { accountId: 'acct-1', assetId: 'asset-1' },
        { accountId: 'acct-2', assetId: 'asset-1' },
      ]),
    ).toEqual([
      { accountId: 'acct-1', assetId: 'asset-1' },
      { accountId: 'acct-2', assetId: 'asset-1' },
    ])
  })

  it('drops rows without an asset id', () => {
    expect(
      toAffectedScopes([
        { accountId: 'acct-1', assetId: null },
        { accountId: 'acct-2', assetId: 'asset-1' },
      ]),
    ).toEqual([{ accountId: 'acct-2', assetId: 'asset-1' }])
  })
})
