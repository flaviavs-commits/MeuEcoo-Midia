import { useCallback } from 'react'
import { render, screen } from '@testing-library/react'
import { useApiResource } from '../../src/hooks/use-api-resource.js'

function Probe({ fail }) {
  const loader = useCallback(() => fail ? Promise.reject(new Error('Falhou ao carregar.')) : Promise.resolve(['Carregado']), [fail])
  const { error, value } = useApiResource(loader, [])
  return <p>{error || value.join(', ') || 'vazio'}</p>
}

describe('useApiResource', () => {
  it('uma carga nova não herda o erro da anterior', async () => {
    const { rerender } = render(<Probe fail />)
    expect(await screen.findByText('Falhou ao carregar.')).toBeInTheDocument()

    rerender(<Probe fail={false} />)
    expect(await screen.findByText('Carregado')).toBeInTheDocument()
    expect(screen.queryByText('Falhou ao carregar.')).not.toBeInTheDocument()
  })
})
