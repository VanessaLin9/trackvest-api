export class TwCatalogBootstrapError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TwCatalogBootstrapError'
  }
}
