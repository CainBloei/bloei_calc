import { Sidebar } from './components/Sidebar';
import { ResultsView } from './components/ResultsView';
import { VermogenChart } from './components/VermogenChart';
import { ComponentChart } from './components/ComponentChart';
import { useCalculate } from './hooks/useCalculate';
import { useState } from 'react';

function App() {
  const { calculate, data, isLoading, error } = useCalculate();
  const [startvermogen, setStartvermogen] = useState(100000);

  const handleCalculate = (inputData: any) => {
    setStartvermogen(Number(inputData.startvermogen));
    calculate(inputData);
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 overflow-hidden font-sans">
      <Sidebar onCalculate={handleCalculate} isLoading={isLoading} />
      
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8">
          
          <header className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              Resultaten
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Vul de parameters in de zijbalk in om de vermogensopbouw te berekenen.
            </p>
          </header>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!data && !isLoading && !error && (
            <div className="text-center py-20 bg-white dark:bg-[#000000] rounded-xl border border-gray-100 dark:border-neutral-600 shadow-sm">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Geen data</h3>
              <p className="mt-1 text-sm text-gray-500">Klik op Bereken Resultaat in de zijbalk om te starten.</p>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bloei-petrol"></div>
            </div>
          )}

          {data && !isLoading && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <ResultsView data={data} />
              <ComponentChart data={data} startvermogen={startvermogen} />
              <VermogenChart data={data} />
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;
