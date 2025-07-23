import React from 'react'
import ReactDOM from 'react-dom/client'
import { DocsApp } from '@fjell/docs-template'
import '@fjell/docs-template/dist/index.css'
import config from '../docs.config'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DocsApp config={config} />
  </React.StrictMode>
)
