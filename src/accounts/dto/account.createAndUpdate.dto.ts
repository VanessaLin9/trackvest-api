import { AccountBaseDto } from './account.base.dto'

/** HTTP 建立／更新帳戶不再帶 userId。擁有者由 session 決定（PR #46）。 */
export class CreateAndUpdateAccountDto extends AccountBaseDto {}
