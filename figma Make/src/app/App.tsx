import { useState } from 'react';
import { Home, FileText, Settings } from 'lucide-react';
import InventoryPage from './components/InventoryPage';
import InOutPage from './components/InOutPage';
import AdminPage from './components/AdminPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState('inventory');

  return (
    <div className="size-full flex bg-[#0a0e1a]">
      {/* Left Sidebar */}
      <div className="w-[160px] border-r border-gray-800 p-4 flex flex-col gap-2">
        {/* Logo */}
        <div className="mb-6">
          <div className="bg-white rounded-lg h-8 w-full"></div>
        </div>

        {/* Navigation */}
        <button
          onClick={() => setCurrentPage('inventory')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            currentPage === 'inventory'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <Home size={20} />
          <div>
            <div className="text-sm">재고</div>
            <div className="text-xs opacity-70">조회와 확인</div>
          </div>
        </button>

        <button
          onClick={() => setCurrentPage('inout')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            currentPage === 'inout'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <FileText size={20} />
          <div>
            <div className="text-sm">입출고 처리</div>
            <div className="text-xs opacity-70">입고와 출시 등록</div>
          </div>
        </button>

        <button
          onClick={() => setCurrentPage('admin')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            currentPage === 'admin'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <Settings size={20} />
          <div>
            <div className="text-sm">관리자</div>
            <div className="text-xs opacity-70">마스터와 설정</div>
          </div>
        </button>

        {/* Layout Mode Info */}
        <div className="mt-auto pt-4 border-t border-gray-800">
          <div className="text-xs text-gray-500 leading-relaxed">
            <div className="mb-1">LAYOUT MODE</div>
            <div>모바일에서는 재고 화면을 유지하고, PC에서는 같은 기능을 더 넓고 빠르게 작업하는 진변합니다.</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {currentPage === 'inventory' && <InventoryPage />}
        {currentPage === 'inout' && <InOutPage />}
        {currentPage === 'admin' && <AdminPage />}
      </div>
    </div>
  );
}
