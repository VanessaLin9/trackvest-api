import { Currency, UserRole } from '@prisma/client'
import { GlController } from './gl.controller'

describe('GlController session user', () => {
  function createHarness() {
    const post = {
      postTransfer: jest.fn(),
      postExpense: jest.fn(),
      postIncome: jest.fn(),
    }
    const controller = new GlController(post as never, {} as never)
    return { controller, post }
  }

  const sessionUser = { id: 'session-user', role: UserRole.user }

  it('posts a transfer as the session user', async () => {
    const { controller, post } = createHarness()

    await controller.transfer(
      {
        fromGlAccountId: 'from-gl',
        toGlAccountId: 'to-gl',
        amount: 1000,
        currency: Currency.TWD,
        date: '2026-01-02T00:00:00.000Z',
        memo: 'move',
      },
      sessionUser,
    )

    expect(post.postTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'session-user',
        fromGlAccountId: 'from-gl',
        toGlAccountId: 'to-gl',
        source: 'manual:transfer',
      }),
    )
  })

  it('posts an expense as the session user', async () => {
    const { controller, post } = createHarness()

    await controller.expense(
      {
        payFromGlAccountId: 'cash-gl',
        expenseGlAccountId: 'expense-gl',
        amount: 320,
        currency: Currency.TWD,
      },
      sessionUser,
    )

    expect(post.postExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'session-user',
        payFromGlAccountId: 'cash-gl',
        source: 'manual:expense',
      }),
    )
  })

  it('posts income as the session user', async () => {
    const { controller, post } = createHarness()

    await controller.income(
      {
        receiveToGlAccountId: 'cash-gl',
        incomeGlAccountId: 'income-gl',
        amount: 1500,
        currency: Currency.TWD,
      },
      sessionUser,
    )

    expect(post.postIncome).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'session-user',
        incomeGlAccountId: 'income-gl',
        source: 'manual:income',
      }),
    )
  })
})
