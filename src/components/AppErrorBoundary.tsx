import {Component,type ErrorInfo,type ReactNode} from 'react'
import {AlertTriangle,RefreshCw} from 'lucide-react'

type Props={children:ReactNode}
type State={failed:boolean}

export class AppErrorBoundary extends Component<Props,State>{
 state:State={failed:false}
 static getDerivedStateFromError():State{return{failed:true}}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('Falha isolada pela proteção da interface',error,info.componentStack)}
 render(){
  if(!this.state.failed)return this.props.children
  return <main className="recovery-page"><section className="recovery-card"><AlertTriangle/><span className="eyebrow">Proteção da interface</span><h1>Esta tela encontrou um problema</h1><p>Seus dados já gravados continuam preservados. Recarregue o sistema para retomar a sessão.</p><button className="button primary" onClick={()=>window.location.reload()}><RefreshCw/>Recarregar sistema</button></section></main>
 }
}
