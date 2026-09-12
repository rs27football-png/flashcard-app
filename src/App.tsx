import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomeScreen } from './ui/screens/HomeScreen'
import { SetDetailScreen } from './ui/screens/SetDetailScreen'
import { CardEditScreen } from './ui/screens/CardEditScreen'
import { ImportScreen } from './ui/screens/ImportScreen'
import { StudyScreen } from './ui/screens/StudyScreen'
import { QuizScreen } from './ui/screens/QuizScreen'
import { MergeScreen } from './ui/screens/MergeScreen'
import { SplitScreen } from './ui/screens/SplitScreen'
import { SearchScreen } from './ui/screens/SearchScreen'

// GitHub Pages はサーバ側の書き換え設定を持たないため, BrowserRouter だと
// /flashcard-app/sets/xxx を再読み込みしたときに404になる. HashRouter を用いる.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/sets/:setId" element={<SetDetailScreen />} />
        <Route path="/sets/:setId/cards" element={<CardEditScreen />} />
        <Route path="/sets/:setId/study" element={<StudyScreen />} />
        <Route path="/sets/:setId/quiz" element={<QuizScreen />} />
        <Route path="/sets/:setId/merge" element={<MergeScreen />} />
        <Route path="/sets/:setId/split" element={<SplitScreen />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/import" element={<ImportScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
