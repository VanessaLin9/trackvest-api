# Investments Input Page - API and Backend Tasks

## Context

本文件定義 `Investments` 頁面後端任務。此頁面第一波只負責：

- 手動輸入投資交易
- 查詢最近幾筆交易
- 匯入券商 CSV

此頁面不是 portfolio summary 頁，不需要在本波提供 holdings、performance、valuation API。

目前後端已具備：

- `POST /transactions`
- `GET /transactions`
- 交易建立後自動過帳到 GL

但缺少：

- type-specific business validation
- CSV import endpoint
- 依券商切 parser 的結構
- alias 查找股名
- row-level import error reporting

## Current State

目前主要實作位置：

- [transactions.service.ts](/Users/vanessa/develop/trackvest-api/src/transactions/transactions.service.ts)
- [transactions.controller.ts](/Users/vanessa/develop/trackvest-api/src/transactions/transactions.controller.ts)
- [create-transaction.dto.ts](/Users/vanessa/develop/trackvest-api/src/transactions/dto/create-transaction.dto.ts)
- [posting.service.ts](/Users/vanessa/develop/trackvest-api/src/gl/posting.service.ts)

現況問題：

- DTO 只有基本欄位驗證，沒有依 `type` 驗證商業規則
- `tax`、`brokerOrderNo` 尚未進交易建立流程
- `sell` 的已實現損益成本仍未完整實作，這不是本波 blocker，但要記錄為已知限制

## Detailed Requirements

### 1. 補強手動交易建立 API

目標：

- 後端成為交易規則的最終守門員
- 不能只靠前端驗證

需求：

- 更新 `CreateTransactionDto` 與對應 service 流程，支援：
  - `tax`
  - `brokerOrderNo`
- 實作 type-specific validation

規則：

- `buy`
  - 必填 `assetId`
  - 必填 `quantity`
  - 必填 `price`
  - `amount > 0`
- `sell`
  - 必填 `assetId`
  - 必填 `quantity`
  - 必填 `price`
  - `amount > 0`
- `dividend`
  - 必填 `assetId`
  - `amount > 0`
- `deposit`
  - 不應帶 `assetId`
  - `amount > 0`

數值規則：

- `fee >= 0`
- `tax >= 0`
- `quantity > 0` when required
- `price > 0` when required

### 2. 調整交易建立與查詢回傳格式

需求：

- `POST /transactions` 回傳應包含 `tax`、`brokerOrderNo`
- `GET /transactions` 的列表 items 也應包含 `tax`、`brokerOrderNo`

若使用 response DTO，需同步補欄位。

### 3. 新增 CSV Import Endpoint

目標：

- 支援從 `Investments` 頁面上傳券商交易 CSV
- 一次匯入多筆交易

建議 API：

- `POST /transactions/import`

建議 request 內容：

- `accountId`
- `file`

建議作法：

- 使用 multipart/form-data
- 在 controller 處理檔案上傳
- 在 service 處理 parsing、validation、insert

### 4. CSV Import Service

需求：

- 建立專用 import service，不要把 parser 全塞進 controller
- 讀取 `accountId` 對應 `Account.broker`
- 依 `broker` 選擇 parser
- 第一版先只實作一個券商 parser，但介面要能擴充

建議結構：

- `transactions/import/`
- `transactions/import/parsers/`
- `transactions/import/services/`

### 5. 第一版 CSV Mapping 規則

以目前富邦格式為準：

- `股名` -> `AssetAlias` 查找 `assetId`
- `日期` -> `tradeTime`
- `成交股數` -> `quantity`
- `淨收付 < 0` -> `type = buy`
- `淨收付 > 0` -> `type = sell`
- `amount = abs(淨收付)`
- `成交單價` -> `price`
- `手續費` -> `fee`
- `交易稅 + 稅款` -> `tax`
- `委託書號` -> `brokerOrderNo`
- `備註` -> `note`

### 6. Import 驗證規則

每列至少驗證：

- 必要欄位存在
- `日期` 可 parse
- `成交股數 > 0`
- `淨收付 != 0`
- `成交單價 > 0`
- `手續費 >= 0`
- `交易稅 >= 0`
- `稅款 >= 0`
- `股名` 能透過 `AssetAlias` 找到對應資產
- `brokerOrderNo` 若存在，不得與同 account 既有資料衝突

### 7. 匯入策略

第一版採「部分成功」。

需求：

- 單列錯誤不影響其他列
- 每列成功時仍走既有交易建立流程
- 每列建立後仍應自動過帳

### 8. Import 回傳格式

建議 response：

```json
{
  "totalRows": 3,
  "successCount": 2,
  "failureCount": 1,
  "createdTransactionIds": ["...", "..."],
  "errors": [
    {
      "row": 3,
      "field": "股名",
      "message": "Asset alias not found for 富邦台50"
    }
  ]
}
```

### 9. Parser 擴充結構

為了後續支援不同券商，第一版就要抽象化：

- parser interface
- parser registry / dispatcher
- broker-specific field mapping

不要把富邦欄位名稱直接散落在 controller 或 transaction service。

## Non-Functional Requirements

- 匯入流程錯誤要有 row 與 field 資訊
- 匯入不可繞過 ownership validation
- 匯入不可直接繞過 existing transaction create logic
- 所有新欄位需進 Swagger / DTO

## Out of Scope

- import preview API
- import rollback all-or-nothing
- 持倉重算
- 下載範本 CSV
- 自動建立新 `Asset`

## Acceptance Criteria

- `POST /transactions` 支援 `tax` 與 `brokerOrderNo`
- 後端能依 `type` 正確驗證交易欄位
- `GET /transactions` 能回傳 `tax` 與 `brokerOrderNo`
- `POST /transactions/import` 可接受 account 與 CSV 檔
- 系統可依 `account.broker` 選擇 parser
- 匯入時可用 `AssetAlias` 解析股名
- 重複的 `accountId + brokerOrderNo` 會被擋下
- 匯入結果會回傳成功筆數、失敗筆數與列級錯誤
- 成功匯入的資料會建立 `Transaction` 並觸發 GL posting

## Handoff Notes

- 本波先不解決 `sell` 成本 basis 的完整 accounting 問題，但不得影響 CSV / 手動輸入主流程完成
- 若 parser 與 upload library 選型需要變更，保留 API contract 與 import result format 不變
