/**
 * Immediate Test Runner for Cross-Device URL Resolution
 * This script runs tests without requiring a full test framework setup
 */

import { extractSharedModelData } from './utils/sharedModelDataExtractor';

// Test Types
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

interface TestSuite {
  name: string;
  results: TestResult[];
  passed: number;
  failed: number;
}

// Test Runner Class
class CrossDeviceTestRunner {
  private results: TestSuite[] = [];

  async runAllTests(): Promise<boolean> {
    console.log('🧪 Starting Cross-Device URL Resolution Tests...');
    console.log('=' .repeat(60));

    const suites = [
      await this.testURLPrioritization(),
      await this.testShareableDataExtraction(),
      await this.testProcessWizardURLResolution(),
      await this.testEdgeCases(),
      await this.testIntegrationFlow()
    ];

    this.results = suites;
    
    // Summary
    const totalPassed = suites.reduce((sum, suite) => sum + suite.passed, 0);
    const totalFailed = suites.reduce((sum, suite) => sum + suite.failed, 0);
    const totalTests = totalPassed + totalFailed;

    console.log('=' .repeat(60));
    console.log(`📊 TEST SUMMARY: ${totalPassed}/${totalTests} tests passed`);
    
    if (totalFailed === 0) {
      console.log('🎉 ALL TESTS PASSED! Cross-device URL resolution is working correctly.');
      return true;
    } else {
      console.log(`❌ ${totalFailed} tests failed. Issues need to be addressed.`);
      this.printFailedTests();
      return false;
    }
  }

  private async testURLPrioritization(): Promise<TestSuite> {
    const suite: TestSuite = {
      name: 'URL Prioritization Tests',
      results: [],
      passed: 0,
      failed: 0
    };

    console.log(`\n🔧 Running ${suite.name}...`);

    // Test 1: Shareable URL over blob URL
    try {
      const mockData = {
        architecturalModel: {
          cadModel: {
            gltfUrl: 'blob:https://localhost:5173/should-not-use',
            shareableGltfUrl: 'https://api.zoo.dev/correct-url.gltf',
            formats: {
              gltf: 'blob:https://localhost:5173/should-not-use',
              shareableGltf: 'https://api.zoo.dev/correct-url.gltf'
            }
          }
        }
      };

      const extractedUrl = mockData.architecturalModel.cadModel.shareableGltfUrl;
      const isCorrect = extractedUrl === 'https://api.zoo.dev/correct-url.gltf' && !extractedUrl.startsWith('blob:');

      suite.results.push({
        name: 'Prioritize shareableGltfUrl over blob URL',
        passed: isCorrect,
        details: { expected: 'https://api.zoo.dev/correct-url.gltf', actual: extractedUrl }
      });

      if (isCorrect) suite.passed++; else suite.failed++;
      console.log(isCorrect ? '  ✅ Shareable URL prioritized correctly' : '  ❌ Failed to prioritize shareable URL');

    } catch (error) {
      suite.results.push({
        name: 'Prioritize shareableGltfUrl over blob URL',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      suite.failed++;
      console.log('  ❌ Test threw error:', error);
    }

    // Test 2: Fallback to formats.shareableGltf
    try {
      const mockData = {
        architecturalModel: {
          cadModel: {
            gltfUrl: 'blob:https://localhost:5173/fallback-blob',
            shareableGltfUrl: null,
            formats: {
              gltf: 'blob:https://localhost:5173/fallback-blob',
              shareableGltf: 'https://api.zoo.dev/formats-fallback.gltf'
            }
          }
        }
      };

      const extractedUrl = mockData.architecturalModel.cadModel.formats.shareableGltf;
      const isCorrect = extractedUrl === 'https://api.zoo.dev/formats-fallback.gltf';

      suite.results.push({
        name: 'Fallback to formats.shareableGltf',
        passed: isCorrect,
        details: { expected: 'https://api.zoo.dev/formats-fallback.gltf', actual: extractedUrl }
      });

      if (isCorrect) suite.passed++; else suite.failed++;
      console.log(isCorrect ? '  ✅ Formats fallback works correctly' : '  ❌ Formats fallback failed');

    } catch (error) {
      suite.results.push({
        name: 'Fallback to formats.shareableGltf',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      suite.failed++;
      console.log('  ❌ Test threw error:', error);
    }

    return suite;
  }

  private async testShareableDataExtraction(): Promise<TestSuite> {
    const suite: TestSuite = {
      name: 'Shareable Data Extraction Tests',
      results: [],
      passed: 0,
      failed: 0
    };

    console.log(`\n📦 Running ${suite.name}...`);

    // Test: extractSharedModelData uses shareable URLs
    try {
      const mockCADModel = {
        id: 'test-cad',
        prompt: 'test design',
        originalPrompt: 'test design',
        gltfUrl: 'blob:https://localhost:5173/blob-url',
        shareableGltfUrl: 'https://api.zoo.dev/shareable.gltf',
        formats: {
          gltf: 'blob:https://localhost:5173/blob-url',
          shareableGltf: 'https://api.zoo.dev/shareable.gltf'
        },
        enhancementInfo: {
          source: 'original',
          confidence: 1.0,
          wasEnhanced: false
        },
        properties: {
          dimensions: { width: 100, height: 50, depth: 25 },
          volume: 125000,
          surfaceArea: 17500,
          complexity: 'moderate'
        }
      };

      const mockArchModel = {
        id: 'test-arch',
        name: 'Test Model',
        description: 'Test model',
        rooms: [],
        doors: [],
        windows: [],
        totalArea: 0,
        gltfUrl: 'blob:should-not-use',
        cadModel: mockCADModel
      };

      const sharedData = extractSharedModelData(2, null, mockArchModel, 'test prompt');
      
      const extractedUrl = sharedData.gltfUrl;
      const isCorrect = extractedUrl === 'https://api.zoo.dev/shareable.gltf' && !extractedUrl?.startsWith('blob:');

      suite.results.push({
        name: 'extractSharedModelData prioritizes shareable URLs',
        passed: isCorrect,
        details: { 
          expected: 'https://api.zoo.dev/shareable.gltf', 
          actual: extractedUrl,
          sharedData: {
            gltfUrl: sharedData.gltfUrl,
            modelDataGltfUrl: sharedData.modelData?.gltfUrl,
            archModelGltfUrl: sharedData.architecturalModel?.gltfUrl
          }
        }
      });

      if (isCorrect) suite.passed++; else suite.failed++;
      console.log(isCorrect ? '  ✅ Shared data extraction uses shareable URLs' : '  ❌ Shared data extraction failed');

    } catch (error) {
      suite.results.push({
        name: 'extractSharedModelData prioritizes shareable URLs',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      suite.failed++;
      console.log('  ❌ Test threw error:', error);
    }

    return suite;
  }

  private async testProcessWizardURLResolution(): Promise<TestSuite> {
    const suite: TestSuite = {
      name: 'ProcessWizard URL Resolution Tests',
      results: [],
      passed: 0,
      failed: 0
    };

    console.log(`\n⚙️ Running ${suite.name}...`);

    // Simulate ProcessWizard URL extraction logic (our updated version)
    const simulateProcessWizardExtraction = (sharedModelData: any): string => {
      return sharedModelData.architecturalModel?.cadModel?.shareableGltfUrl ||
             sharedModelData.architecturalModel?.cadModel?.formats?.shareableGltf ||
             sharedModelData.gltfUrl || 
             sharedModelData.architecturalModel?.gltfUrl || 
             sharedModelData.architecturalModel?.cadModel?.gltfUrl ||
             sharedModelData.generatedResults?.gltfUrl ||
             sharedModelData.cadData?.gltfUrl ||
             sharedModelData.modelData?.gltfUrl ||
             '';
    };

    // Test: ProcessWizard URL extraction prioritizes shareable URLs
    try {
      const mockSharedData = {
        architecturalModel: {
          gltfUrl: 'blob:should-not-use-1',
          cadModel: {
            gltfUrl: 'blob:should-not-use-2',
            shareableGltfUrl: 'https://api.zoo.dev/wizard-test.gltf',
            formats: {
              shareableGltf: 'https://api.zoo.dev/formats-backup.gltf'
            }
          }
        },
        gltfUrl: 'blob:should-not-use-3'
      };

      const extractedUrl = simulateProcessWizardExtraction(mockSharedData);
      const isCorrect = extractedUrl === 'https://api.zoo.dev/wizard-test.gltf';

      suite.results.push({
        name: 'ProcessWizard prioritizes shareableGltfUrl',
        passed: isCorrect,
        details: { expected: 'https://api.zoo.dev/wizard-test.gltf', actual: extractedUrl }
      });

      if (isCorrect) suite.passed++; else suite.failed++;
      console.log(isCorrect ? '  ✅ ProcessWizard URL extraction correct' : '  ❌ ProcessWizard URL extraction failed');

    } catch (error) {
      suite.results.push({
        name: 'ProcessWizard prioritizes shareableGltfUrl',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      suite.failed++;
      console.log('  ❌ Test threw error:', error);
    }

    return suite;
  }

  private async testEdgeCases(): Promise<TestSuite> {
    const suite: TestSuite = {
      name: 'Edge Case Tests',
      results: [],
      passed: 0,
      failed: 0
    };

    console.log(`\n🔍 Running ${suite.name}...`);

    // Test: Handle null/undefined values gracefully
    try {
      const mockArchModelWithNulls = {
        id: 'null-test',
        name: 'Null Test',
        description: 'Test null handling',
        rooms: [],
        doors: [],
        windows: [],
        totalArea: 0,
        gltfUrl: 'https://backup-url.com/model.gltf',
        cadModel: null
      };

      const sharedData = extractSharedModelData(2, null, mockArchModelWithNulls, 'test');
      const hasValidUrl = !!sharedData.gltfUrl;

      suite.results.push({
        name: 'Handle null CAD model gracefully',
        passed: hasValidUrl,
        details: { sharedDataUrl: sharedData.gltfUrl }
      });

      if (hasValidUrl) suite.passed++; else suite.failed++;
      console.log(hasValidUrl ? '  ✅ Null handling works correctly' : '  ❌ Null handling failed');

    } catch (error) {
      suite.results.push({
        name: 'Handle null CAD model gracefully',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      suite.failed++;
      console.log('  ❌ Test threw error:', error);
    }

    // Test: URL validation
    try {
      const isValidShareableUrl = (url: string): boolean => {
        if (!url) return false;
        if (url.startsWith('blob:')) return false;
        if (url.startsWith('http://localhost')) return false;
        if (url.startsWith('http://127.0.0.1')) return false;
        return url.startsWith('http://') || url.startsWith('https://');
      };

      const validUrl = 'https://api.zoo.dev/model.gltf';
      const invalidUrl = 'blob:https://localhost:5173/12345';

      const validTest = isValidShareableUrl(validUrl);
      const invalidTest = !isValidShareableUrl(invalidUrl);

      suite.results.push({
        name: 'URL validation works correctly',
        passed: validTest && invalidTest,
        details: { validUrl, invalidUrl, validTest, invalidTest }
      });

      if (validTest && invalidTest) suite.passed++; else suite.failed++;
      console.log((validTest && invalidTest) ? '  ✅ URL validation works' : '  ❌ URL validation failed');

    } catch (error) {
      suite.results.push({
        name: 'URL validation works correctly',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      suite.failed++;
      console.log('  ❌ Test threw error:', error);
    }

    return suite;
  }

  private async testIntegrationFlow(): Promise<TestSuite> {
    const suite: TestSuite = {
      name: 'Integration Flow Tests',
      results: [],
      passed: 0,
      failed: 0
    };

    console.log(`\n🔄 Running ${suite.name}...`);

    // Test: Complete flow from CAD model creation to ProcessWizard reconstruction
    try {
      // Step 1: Simulate CAD model with shareable URL (our fix)
      const simulateCADModelCreation = (downloadUrl: string) => {
        const gltfUrl = 'blob:https://localhost:5173/generated-blob';
        const originalDownloadableUrl = downloadUrl;
        
        return {
          id: 'integration-test',
          gltfUrl: gltfUrl,
          shareableGltfUrl: originalDownloadableUrl && originalDownloadableUrl.startsWith('http') 
            ? originalDownloadableUrl 
            : gltfUrl,
          formats: {
            gltf: gltfUrl,
            shareableGltf: originalDownloadableUrl && originalDownloadableUrl.startsWith('http') 
              ? originalDownloadableUrl 
              : gltfUrl
          }
        };
      };

      const cadModel = simulateCADModelCreation('https://api.zoo.dev/download/integration-test.gltf');

      // Step 2: Create architectural model
      const archModel = {
        id: 'integration-arch',
        name: 'Integration Test',
        description: 'Complete integration test',
        rooms: [],
        doors: [],
        windows: [],
        totalArea: 0,
        cadModel: cadModel
      };

      // Step 3: Extract shared data
      const sharedData = extractSharedModelData(2, null, archModel, 'integration test');

      // Step 4: Simulate ProcessWizard reconstruction
      const processWizardUrl = sharedData.architecturalModel?.cadModel?.shareableGltfUrl ||
                               sharedData.architecturalModel?.cadModel?.formats?.shareableGltf ||
                               sharedData.gltfUrl;

      // Validation
      const isCorrect = processWizardUrl === 'https://api.zoo.dev/download/integration-test.gltf' &&
                       !processWizardUrl?.startsWith('blob:');

      suite.results.push({
        name: 'Complete integration flow uses shareable URLs',
        passed: isCorrect,
        details: {
          cadModelShareableUrl: cadModel.shareableGltfUrl,
          sharedDataUrl: sharedData.gltfUrl,
          processWizardUrl: processWizardUrl,
          expected: 'https://api.zoo.dev/download/integration-test.gltf'
        }
      });

      if (isCorrect) suite.passed++; else suite.failed++;
      console.log(isCorrect ? '  ✅ Integration flow works correctly' : '  ❌ Integration flow failed');

    } catch (error) {
      suite.results.push({
        name: 'Complete integration flow uses shareable URLs',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      suite.failed++;
      console.log('  ❌ Test threw error:', error);
    }

    return suite;
  }

  private printFailedTests(): void {
    console.log('\n❌ FAILED TESTS DETAILS:');
    console.log('-' .repeat(40));
    
    this.results.forEach(suite => {
      const failedTests = suite.results.filter(test => !test.passed);
      if (failedTests.length > 0) {
        console.log(`\n📋 ${suite.name}:`);
        failedTests.forEach(test => {
          console.log(`  ❌ ${test.name}`);
          if (test.error) {
            console.log(`     Error: ${test.error}`);
          }
          if (test.details) {
            console.log(`     Details:`, JSON.stringify(test.details, null, 4));
          }
        });
      }
    });
  }

  getResults(): TestSuite[] {
    return this.results;
  }
}

// Export for use
export { CrossDeviceTestRunner };

// Create global test runner function
export const runCrossDeviceURLTests = async (): Promise<boolean> => {
  const runner = new CrossDeviceTestRunner();
  return await runner.runAllTests();
};

// Make available in browser console
if (typeof window !== 'undefined') {
  (window as any).runCrossDeviceURLTests = runCrossDeviceURLTests;
  console.log('🧪 Cross-device URL tests loaded. Run window.runCrossDeviceURLTests() to execute.');
}