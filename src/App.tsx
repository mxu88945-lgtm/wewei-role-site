import { useState } from 'react'

function App() {
  const [currentPage, setCurrentPage] = useState<'chat' | 'characters' | 'settings'>('chat')

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold text-purple-400">Tavo Web</h1>
          <p className="text-xs text-gray-500">角色扮演前端</p>
        </div>
        
        <div className="flex-1 p-2">
          <button 
            onClick={() => setCurrentPage('characters')}
            className={`w-full text-left px-4 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-800 ${currentPage === 'characters' ? 'bg-gray-800' : ''}`}
          >
            角色管理
          </button>
          <button 
            onClick={() => setCurrentPage('chat')}
            className={`w-full text-left px-4 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-800 ${currentPage === 'chat' ? 'bg-gray-800' : ''}`}
          >
            聊天界面
          </button>
          <button 
            onClick={() => setCurrentPage('settings')}
            className={`w-full text-left px-4 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-800 ${currentPage === 'settings' ? 'bg-gray-800' : ''}`}
          >
            设置
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {currentPage === 'chat' && (
          <div className="flex-1 p-8 flex flex-col items-center justify-center text-gray-400">
            <div className="text-6xl mb-4">💬</div>
            <h2 className="text-2xl mb-2">欢迎来到 Tavo Web</h2>
            <p className="text-center max-w-md">这是一个仿 Tavo 的网页版角色扮演前端<br/>导入角色卡后即可开始聊天</p>
          </div>
        )}
        {currentPage === 'characters' && (
          <div className="flex-1 p-8">
            <h2 className="text-2xl mb-6">角色管理</h2>
            <div className="bg-gray-900 rounded-xl p-8 text-center text-gray-400">
              角色导入功能开发中...<br/>支持 JSON / PNG 角色卡
            </div>
          </div>
        )}
        {currentPage === 'settings' && (
          <div className="flex-1 p-8">
            <h2 className="text-2xl mb-6">设置</h2>
            <div className="bg-gray-900 rounded-xl p-8 text-center text-gray-400">
              API 配置、模型参数、长期记忆等设置开发中...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
