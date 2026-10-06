import { Route, Routes } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'
import Translate_Sign from './pages/Translate_SignPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
      <Route path='/Translate' element={<Translate_Sign />}/>
    </Routes>
  )
}
