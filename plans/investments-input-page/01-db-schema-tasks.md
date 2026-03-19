# Investments Input Page - DB Schema Tasks

## Context

本文件描述 `Investments` 頁面第一波需求所需的資料庫調整。此頁面的 scope 不是 portfolio 或 holdings summary，而是：

- 手動輸入投資交易
- 顯示最近幾筆交易紀錄
- 支援券商 `.csv` 匯入交易紀錄

目前系統已有 `Account`、`Asset`、`Transaction`、`GlEntry`、`GlLine` 等模型，但在 CSV 匯入與多券商支援上有幾個明顯缺口：

- `Transaction` 沒有 `tax`
- `Transaction` 沒有 `brokerOrderNo`
- `Account` 沒有券商識別欄位
- `Asset` 無法用券商 CSV 的中文股名穩定對應，缺少 alias / dictionary 結構

本文件目標是讓 schema 能支援：

- 手動輸入與 CSV 匯入共用同一套交易表
- 以 `account` 作為匯入目標帳戶
- 未來可依帳戶對應券商 parser
- 能記錄券商單號並避免重複匯入

## Current State

目前相關模型在 [schema.prisma](/Users/vanessa/develop/trackvest-api/prisma/schema.prisma)：

- `Account`: 只有 `name/type/currency`
- `Asset`: 只有 `symbol/name/type/baseCurrency`
- `Transaction`: 只有 `amount/quantity/price/fee/tradeTime/note`

目前沒有：

- `broker`
- `tax`
- `brokerOrderNo`
- `AssetAlias`

## Detailed Requirements

### 1. Account 新增券商識別欄位

目的：

- 讓 CSV 匯入可以依 `accountId -> broker` 選擇 parser
- 讓同一使用者可有多個不同券商帳戶

需求：

- 在 `Account` 新增 `broker` 欄位
- 型別可先用 `String?`，避免第一版被 enum 綁死
- 非 `broker` 類型帳戶可為 `null`

建議資料意義：

- `fubon`
- `sinopac`
- `cathay`

### 2. Transaction 新增 tax 欄位

目的：

- 對應 CSV 中的 `交易稅` 與 `稅款`
- 避免把稅額塞進 `note`

需求：

- 在 `Transaction` 新增 `tax Decimal @default(0)`
- 手動建立交易與 CSV 匯入都要能寫入

第一版 mapping：

- `tax = 交易稅 + 稅款`

### 3. Transaction 新增 brokerOrderNo 欄位

目的：

- 存券商回傳的委託書號
- 支援去重與稽核

需求：

- 在 `Transaction` 新增 `brokerOrderNo String?`
- 若是手動輸入可為 `null`
- 若是 CSV 匯入且原始資料有此欄位，應寫入

### 4. Transaction 唯一性約束

目的：

- 避免同一帳戶重複匯入同一筆券商交易

需求：

- 在 `Transaction` 增加唯一約束 `@@unique([accountId, brokerOrderNo])`

注意：

- Prisma/Postgres 對 `NULL` 的唯一性不衝突，因此手動建立交易可保留 `brokerOrderNo = null`
- 若後續要支援同帳戶不同來源匯入，再評估是否需要改成更完整的 import key

### 5. 新增 AssetAlias table

目的：

- 讓 CSV 的中文股名可穩定映射到既有 `Asset`
- 支援不同券商對同一資產使用不同名稱

需求：

- 新增 `AssetAlias` 模型
- 至少包含以下欄位：
  - `id`
  - `assetId`
  - `alias`
  - `broker String?`
- relation 到 `Asset`
- 建議唯一約束：
  - `@@unique([alias, broker])`
- 建議索引：
  - `@@index([assetId])`

建議語意：

- `broker = null` 代表全域通用 alias
- `broker = 'fubon'` 代表富邦券商專屬 alias

### 6. Migration 與 Seed

需求：

- 新增 Prisma migration
- 更新 seed，至少準備：
  - 一個 `broker` account，含 `broker` 值
  - 一筆 `Asset`
  - 對應的 `AssetAlias`

## Suggested Prisma Shape

以下為建議方向，不要求一字不差照抄：

```prisma
model Account {
  id        String      @id @default(uuid())
  userId    String
  name      String
  type      AccountType
  currency  Currency
  broker    String?
  createdAt DateTime    @default(now())
}

model Transaction {
  id            String   @id @default(uuid())
  accountId      String
  assetId        String?
  type           TxType
  amount         Decimal
  quantity       Decimal?
  price          Decimal?
  fee            Decimal  @default(0)
  tax            Decimal  @default(0)
  brokerOrderNo  String?
  tradeTime      DateTime
  note           String?

  @@unique([accountId, brokerOrderNo])
}

model AssetAlias {
  id      String  @id @default(uuid())
  assetId String
  alias   String
  broker  String?
  asset   Asset   @relation(fields: [assetId], references: [id], onDelete: Cascade)

  @@unique([alias, broker])
  @@index([assetId])
}
```

## Out of Scope

以下不屬於本波 DB 任務：

- holdings / position 重算
- 匯入批次歷史表
- 匯入原始 CSV 保存
- 多幣別交易表重構

## Acceptance Criteria

- `Account` 可儲存券商識別值
- `Transaction` 可儲存 `tax`
- `Transaction` 可儲存 `brokerOrderNo`
- 同一 `accountId + brokerOrderNo` 不可重複
- 系統可用 `AssetAlias` 將券商 CSV 中文股名對應到 `Asset`
- migration 可在本地成功執行
- seed 可建立至少一組可驗證 CSV mapping 的測試資料

## Handoff Notes

- API 與 frontend 都應以本文件為基礎，不要再假設 `tax` 或 `brokerOrderNo` 只存在於 note
- CSV import service 實作前，先完成本文件對應的 schema 與 migration
