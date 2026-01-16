'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function RunMigrationPage() {
  const [status, setStatus] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);

  const runMigration = async () => {
    setIsRunning(true);
    setStatus('Running migration...');

    try {
      const response = await fetch('/api/run-migration', {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        setStatus('✓ Migration completed successfully!');
      } else {
        setStatus(`✗ Error: ${result.error}`);
      }
    } catch (error) {
      setStatus(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Run Database Migration</h1>

      <div className="bg-yellow-50 border-2 border-yellow-300 p-6 mb-6">
        <h2 className="font-semibold text-yellow-900 mb-2">Migration: Add Multiple Contacts Support</h2>
        <p className="text-sm text-yellow-800 mb-4">
          This migration adds support for multiple emails and phone numbers per contact.
          It will add <code>emails</code> and <code>phones</code> JSONB columns to the contacts table.
        </p>
        <p className="text-sm text-yellow-800">
          This is required for the Word document contact extraction feature to work properly.
        </p>
      </div>

      <Button
        onClick={runMigration}
        disabled={isRunning}
        className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold mb-4"
      >
        {isRunning ? 'Running...' : 'Run Migration'}
      </Button>

      {status && (
        <div className={`p-4 border-2 ${status.startsWith('✓') ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
          <p className={`text-sm ${status.startsWith('✓') ? 'text-green-900' : 'text-red-900'}`}>
            {status}
          </p>
        </div>
      )}
    </div>
  );
}
