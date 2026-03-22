# Investments Input Page - Frontend Component Tasks

## Context

本文件定義 `Investments` 頁面前端任務。此頁面定位為：

- 上半部：手動輸入投資交易
- 中段或側邊：CSV 匯入
- 下半部：最近幾筆交易紀錄

此頁面不包含：

- holdings summary
- performance chart
- portfolio allocation

那些功能會是未來的獨立頁面，不應在本波混入。

目前頁面在 [Transactions.tsx](/Users/vanessa/develop/trackvest-web/src/pages/Transactions.tsx)，已經具備基礎輸入與 recent transactions 顯示，但還缺少：

- `tax` 欄位
- 更清楚的欄位驗證
- CSV upload UI
- 匯入結果顯示
- 對新欄位的 recent list 呈現

## Current State

目前前端已具備：

- mode 切換：`deposit/buy/sell/dividend`
- account / asset 下拉
- `buy/sell` 自動算 amount
- recent transactions table
- 呼叫 `/accounts`、`/assets`、`/transactions`

目前限制：

- 仍依賴 `VITE_DEMO_USER_ID`
- 沒有 `tax`
- 沒有 CSV 上傳
- 沒有 row-level import error UI

## Detailed Requirements

### 1. 手動交易輸入區塊補強

需求：

- 保留目前單頁輸入體驗
- 在現有 form 上補 `tax` 欄位
- 視 `mode` 切換欄位顯示與驗證

建議欄位行為：

- `deposit`
  - `account`
  - `tradeTime`
  - `amount`
  - `note`
- `buy`
  - `account`
  - `tradeTime`
  - `asset`
  - `quantity`
  - `price`
  - `fee`
  - `tax`
  - `computed amount`
  - `note`
- `sell`
  - 同 `buy`
- `dividend`
  - `account`
  - `tradeTime`
  - `asset`
  - `amount`
  - `note`

### 2. 表單驗證與錯誤呈現

需求：

- 在送出前先做前端驗證
- 錯誤訊息要對應到欄位與 mode，不要只顯示 generic error

至少要檢查：

- `account` 必選
- `asset` 在需要時必選
- `quantity/price` 在買賣時必填且大於 0
- `amount` 必須大於 0
- `fee/tax` 不可小於 0
- `tradeTime` 必須有效

### 3. CSV Upload 區塊

需求：

- 在 `Investments` 頁面加入獨立區塊
- 提供檔案選擇按鈕
- 提供 account 選擇
- 顯示支援格式的簡短說明

UI 最低需求：

- `Select account`
- `Choose CSV file`
- `Import` button
- 格式說明文字

### 4. 前端 CSV 基本檢查

需求：

- 匯入前先做基本檢查，減少無效請求

至少檢查：

- 已選 account
- 已選檔案
- 副檔名為 `.csv`
- 檔案非空

如果前端要進一步讀檔，也可檢查 header 是否存在，但第一版不是必須。

### 5. 匯入結果 UI

需求：

- 顯示：
  - `totalRows`
  - `successCount`
  - `failureCount`
- 若有錯誤，列出：
  - row
  - field
  - message
- 匯入成功後自動 refresh recent transactions

### 6. Recent Transactions 區塊調整

需求：

- recent list 繼續只顯示最近幾筆，不升級成 full ledger page
- 補上新欄位的合理呈現

建議欄位：

- 時間
- 類型
- Account
- Asset
- Amount
- Quantity / Price
- Fee / Tax
- Broker order no
- Note

若畫面過長，可以把 `quantity/price/fee/tax` 合併為一個 details 欄。

### 7. Service Layer 更新

需求：

- 更新 [investments.service.ts](/Users/vanessa/develop/trackvest-web/src/lib/investments.service.ts)
- `CreateTransactionPayload` 加上 `tax`、`brokerOrderNo`
- `TransactionListItem` 加上 `tax`、`brokerOrderNo`
- 新增 `importTransactionsCsv(...)` 方法

## UX Constraints

- 此頁面是操作頁，不是分析頁
- 新增 UI 時不要擠掉主要輸入流程
- CSV upload 可放在輸入區旁邊或 recent list 上方，但不能比手動輸入更搶主視覺

## Out of Scope

- holdings cards
- ROI / P&L summary
- advanced chart
- CSV preview table
- transaction edit / delete

## Acceptance Criteria

- 手動輸入表單支援 `tax`
- 不同 mode 會顯示正確欄位
- 前端能阻擋明顯不合法輸入
- 頁面上有 CSV upload 區塊
- 使用者必須選 account 才能匯入
- 匯入結果會顯示成功/失敗摘要
- 匯入成功後 recent transactions 會刷新
- recent transactions 可看到新欄位資訊，至少包含 `fee/tax`，若有值則可看到 `brokerOrderNo`

## Handoff Notes

- frontend 不應自行推斷 broker parser 規則，只需上傳 `accountId + file`
- holdings 需求若之後新增，請另開頁面，不要把本頁面繼續膨脹
