# Investments Input Page - Broker Account Setup Tasks

## Context

目前 `Investments` 頁面的手動輸入與 CSV 匯入流程已經基本完成：

- `Transaction` 已支援 `tax`、`brokerOrderNo`
- 後端已支援 `/transactions/import`
- 前端 `Investments` 頁面已支援 CSV 檔案上傳、讀檔、匯入結果顯示
- 匯入流程依賴 `Account.broker` 與 `AssetAlias`

但手動驗證時發現一個產品流程缺口：

- 使用者雖然可以在資料模型與 API 層建立 `broker` account
- 但目前沒有正式的使用者介面來「新增 / 修改有 broker 的券商帳戶」
- 導致 CSV import 雖然技術上可用，實際上仍缺一個可操作的前置步驟

這使得目前流程仍偏工程/測試流程，而不是完整的使用者流程。

## Product Decision

第一版券商固定為：

- `cathay`

這代表：

- broker 選單第一版只需要提供 `Cathay`
- 匯入 parser 第一版應以 `cathay` 為預設支援目標
- 既有 seed / alias /測試資料如果先前使用 `fubon`，後續需要逐步調整為 `cathay`

## Why This Is Needed

CSV 匯入流程目前依賴：

1. 使用者先建立一個 `type = broker` 的 account
2. 該 account 必須有 `broker` 值
3. `Investments` 頁面只對這種 account 開放 CSV 匯入

如果沒有 broker account setup UI，實際使用上會出現：

- 使用者不知道去哪裡設定 broker
- 建了 broker account 但沒有 broker 值
- import 下拉選單出現帳戶，但送出後被 backend 擋掉

## Scope

本任務只處理：

- broker account 的建立與修改流程
- `Accounts` 頁的最小可用 UI
- `Investments` 頁匯入帳戶選單的顯示邏輯

本任務不處理：

- 多券商管理頁
- broker CRUD master data
- parser marketplace
- holdings / portfolio

## Current State

目前相關狀態如下：

- `Account` schema 已有 `broker`
- backend `/accounts` DTO 已支援 `broker`
- frontend `Accounts` 頁仍主要是 API tester 介面，不是正式流程
- `Investments` 匯入 UI 已存在，但它需要可用的 broker account 才能完成操作

## Detailed Requirements

### 1. Broker 值的產品規則

第一版固定：

- `broker = "cathay"`

需求：

- 使用者建立 broker account 時，不應自由輸入任意 broker 字串
- UI 上應顯示固定選單
- 第一版選項只有：
  - `Cathay`

建議前後端都使用實際儲存值：

- `cathay`

### 2. Accounts 頁提供正式建立 / 修改 broker account 的能力

需求：

- 在現有 `Accounts` 頁上提供最小可用表單
- 使用者可建立一般 account，也可建立 broker account
- 當 `type = broker` 時：
  - broker 欄位顯示
  - broker 必填
- 當 `type != broker` 時：
  - broker 欄位隱藏或 disabled
  - 送出時不帶 broker 或帶 `null`

表單最少欄位：

- `userId`
- `name`
- `type`
- `currency`
- `broker`（只在 broker 類型顯示）

### 3. Backend account 驗證補強

需求：

- 當 `type = broker` 時：
  - `broker` 必填
  - 第一版只能接受 `cathay`
- 當 `type != broker` 時：
  - `broker` 不應存在，或應被清空

這個驗證不能只放前端，backend 也必須做。

### 4. Accounts 列表顯示 broker 資訊

需求：

- `Accounts` 頁列表能看到 `broker`
- 使用者可辨識哪個 account 已經配置成可匯入券商帳戶

### 5. Investments 匯入帳戶下拉過濾

需求：

- 匯入帳戶下拉只顯示：
  - `type = broker`
  - `broker` 非空
- 不應讓使用者選到沒有 broker 的 broker account

建議：

- 若沒有任何可用 account，顯示明確提示：
  - `No broker account configured for CSV import`

### 6. 文案與引導

需求：

- 在 `Investments` 匯入區塊給簡短提示：
  - 先到 `Accounts` 建立 `Cathay` broker account
- 或在沒有可用 account 時給明確引導

## Suggested Implementation Order

1. backend 補 account broker validation
2. frontend `Accounts` 頁補 broker account 建立/修改表單
3. frontend `Accounts` 頁列表補 broker 欄位
4. frontend `Investments` 匯入帳戶下拉只顯示可用 broker account
5. 調整匯入提示文案

## Acceptance Criteria

- 使用者可在 UI 上建立 `type = broker` 且 `broker = cathay` 的 account
- 使用者可在 UI 上修改既有 broker account
- `type = broker` 但未填 broker 時，backend 會拒絕
- `type != broker` 卻帶 broker 時，backend 會拒絕或清空
- `Investments` 匯入帳戶下拉不會顯示未配置 broker 的帳戶
- 若沒有可用 broker account，使用者能看懂缺什麼
- 第一版 broker 值固定為 `cathay`

## Follow-Up Work

這個任務完成後，下一步應補：

- 把目前 CSV import / asset alias 的測試資料與 parser 預設值從 `fubon` 調整到 `cathay`
- 補 `cathay` 對應的 asset alias seed
- 補實際 `cathay` CSV 範例驗證

## Handoff Notes

- 此任務是 CSV import 真正可用的產品化前置條件，不是可有可無的 UX 優化
- 下個 session 若要接手，請先閱讀：
  - [01-db-schema-tasks.md](/Users/vanessa/develop/trackvest-api/plans/investments-input-page/01-db-schema-tasks.md)
  - [02-api-backend-tasks.md](/Users/vanessa/develop/trackvest-api/plans/investments-input-page/02-api-backend-tasks.md)
  - [03-frontend-component-tasks.md](/Users/vanessa/develop/trackvest-api/plans/investments-input-page/03-frontend-component-tasks.md)
  - [04-validation-rules-tasks.md](/Users/vanessa/develop/trackvest-api/plans/investments-input-page/04-validation-rules-tasks.md)

本文件補的是「broker account setup」這條新需求線。
