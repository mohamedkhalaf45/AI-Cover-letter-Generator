
import React, { useState, useCallback, useEffect } from 'react';
import { generateCoverLetter, analyzeCvWithATS, optimizeCv, ATSReport, CvDetails, extractCvDetails, extractJobInfo, JobInfo } from './services/geminiService';
import { UploadIcon, ClipboardIcon, CheckIcon, SpinnerIcon, ChartBarIcon, WandIcon, ChevronDownIcon } from './components/icons';

// This tells TypeScript that these libraries will be available on the window object
// They are loaded via script tags in index.html
declare const pdfjsLib: any;
declare const Tesseract: any;

type AppState = 'idle' | 'loading' | 'success' | 'error';
type ActiveAction = 'cover-letter' | 'ats' | 'cv' | null;

// Debounce hook to avoid excessive API calls while typing
// FIX: Added a trailing comma to the generic parameter <T> to disambiguate from JSX syntax for the TSX parser.
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
};


const Header: React.FC = () => (
  <header className="bg-slate-800/50 backdrop-blur-sm p-4 border-b border-slate-700 fixed top-0 left-0 right-0 z-10">
    <div className="container mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-white text-center">AI Cover Letter Generator</h1>
      <p className="text-sm text-slate-400 text-center">Craft the perfect cover letter in seconds.</p>
    </div>
  </header>
);

const ResultCard: React.FC<{ title: string; content: string }> = ({ title, content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg relative animate-fade-in mt-8">
      <h2 className="text-xl font-semibold text-white mb-4">{title}</h2>
      <button
        onClick={handleCopy}
        className="absolute top-4 right-4 p-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        aria-label="Copy to clipboard"
      >
        {copied ? <CheckIcon className="w-5 h-5 text-green-400" /> : <ClipboardIcon className="w-5 h-5" />}
      </button>
      <div className="text-slate-300 whitespace-pre-wrap font-mono text-sm leading-relaxed bg-slate-900/50 p-4 rounded-md">{content}</div>
    </div>
  );
};

const ATSScoreCard: React.FC<{ report: ATSReport }> = ({ report }) => {
  const getRingColor = (score: number) => {
    if (score >= 85) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };
  const colorClass = getRingColor(report.score);

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg relative animate-fade-in mt-8">
       <h2 className="text-xl font-semibold text-white mb-4">ATS Analysis Report</h2>
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center justify-center p-4 bg-slate-900/50 rounded-lg">
              <div className="relative w-32 h-32">
                  <svg className="w-full h-full" viewBox="0 0 36 36">
                      <path className="text-slate-700" strokeWidth="3" stroke="currentColor" fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path className={colorClass} strokeWidth="3" strokeDasharray={`${report.score}, 100`} strokeLinecap="round" stroke="currentColor" fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                  </svg>
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                      <span className={`text-3xl font-bold ${colorClass}`}>{report.score}</span>
                      <span className="text-lg text-slate-400">/100</span>
                  </div>
              </div>
              <p className="mt-2 text-lg font-semibold text-slate-300">Overall Match</p>
          </div>
          <div className="md:col-span-2 space-y-4">
              <div>
                  <h3 className="text-lg font-semibold text-green-400 mb-2">Strengths</h3>
                  <p className="text-slate-300 text-sm">{report.strengths}</p>
              </div>
              <div>
                  <h3 className="text-lg font-semibold text-yellow-400 mb-2">Suggestions for Improvement</h3>
                  <p className="text-slate-300 text-sm">{report.suggestions}</p>
              </div>
          </div>
       </div>
    </div>
  );
};

const FormSection: React.FC<{ number: number; title: string; children: React.ReactNode; isExtracting?: boolean; extractionText?: string }> = ({ number, title, children, isExtracting, extractionText }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border border-slate-700 rounded-lg">
      <button
        type="button"
        className="w-full flex justify-between items-center p-4 bg-slate-800 rounded-t-lg hover:bg-slate-700/50"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="flex items-center">
          <h2 className="text-lg font-medium text-white">
            <span className="mr-2">{number}.</span>{title}
          </h2>
          {isExtracting && (
            <div className="flex items-center ml-4">
              <SpinnerIcon className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-blue-400 ml-2">{extractionText || 'Analyzing...'}</span>
            </div>
          )}
        </div>
        <ChevronDownIcon className={`w-5 h-5 text-slate-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="p-4">{children}</div>}
    </div>
  );
};


export default function App() {
  const [jobDescription, setJobDescription] = useState<string>('');
  const debouncedJobDescription = useDebounce(jobDescription, 500);

  const [cvText, setCvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [appState, setAppState] = useState<AppState>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  
  const [cvDetails, setCvDetails] = useState<CvDetails | null>(null);
  const [jobInfo, setJobInfo] = useState<JobInfo | null>(null);
  const [isExtractingCvDetails, setIsExtractingCvDetails] = useState(false);
  const [isExtractingJobInfo, setIsExtractingJobInfo] = useState(false);

  const [atsReport, setAtsReport] = useState<ATSReport | null>(null);
  const [optimizedCv, setOptimizedCv] = useState<string>('');
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  
  useEffect(() => {
    if (debouncedJobDescription) {
      const getJobInfo = async () => {
        setIsExtractingJobInfo(true);
        setError(null);
        try {
          const info = await extractJobInfo(debouncedJobDescription);
          setJobInfo(info);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setIsExtractingJobInfo(false);
        }
      };
      getJobInfo();
    }
  }, [debouncedJobDescription]);
  
  const processCvText = useCallback(async (text: string) => {
    setCvText(text);
    setIsExtractingCvDetails(true);
    setError(null);
    try {
      const details = await extractCvDetails(text);
      setCvDetails(details);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsExtractingCvDetails(false);
    }
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setCoverLetter('');
    setAtsReport(null);
    setOptimizedCv('');
    setCvText('');
    setCvDetails(null);
    setAppState('idle');
    setIsProcessingFile(true);

    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) {
          setError('Failed to read PDF file.');
          setAppState('error');
          setIsProcessingFile(false);
          return;
        }
        try {
          setProcessingMessage('Reading PDF...');
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

          const typedArray = new Uint8Array(e.target.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument(typedArray).promise;
          
          const textContents = await Promise.all(
            Array.from({ length: pdf.numPages }, (_, i) =>
              pdf.getPage(i + 1).then(page => page.getTextContent())
            )
          );
          const fullText = textContents.map(content => 
            content.items.map((item: any) => item.str).join(' ')
          ).join('\n\n');

          if (fullText.trim().length < 100) {
            setProcessingMessage('No text layer found, scanning document with OCR...');
            const worker = await Tesseract.createWorker('eng');
            const { data: { text } } = await worker.recognize(e.target.result);
            await worker.terminate();
            await processCvText(text);
          } else {
            await processCvText(fullText);
          }
        } catch (pdfError: any) {
          setError(`Could not process the PDF. Error: ${pdfError.message}`);
          setAppState('error');
        } finally {
          setIsProcessingFile(false);
          setProcessingMessage('');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setProcessingMessage('Reading file...');
      const reader = new FileReader();
      reader.onload = async (e) => {
        await processCvText(e.target?.result as string);
        setIsProcessingFile(false);
        setProcessingMessage('');
      };
      reader.readAsText(file);
    }
  }, [processCvText]);

  const handleGenerateCoverLetter = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!jobDescription || !cvText || !cvDetails || !jobInfo) {
      setError('Please provide a job description and CV, and wait for the details to be extracted.');
      setAppState('error');
      return;
    }

    setAppState('loading');
    setActiveAction('cover-letter');
    setError(null);
    setCoverLetter('');
    setAtsReport(null);
    setOptimizedCv('');

    try {
      const subject = `Application for ${jobInfo.role} at ${jobInfo.company}`;
      const result = await generateCoverLetter(jobDescription, cvText, cvDetails, subject, jobInfo.hiringManager);
      setCoverLetter(result);
      setAppState('success');
    } catch (e: any) {
      setError(e.message || 'An unexpected error occurred.');
      setAppState('error');
    } finally {
      setActiveAction(null);
    }
  }, [jobDescription, cvText, cvDetails, jobInfo]);

  const handleAnalyzeATS = useCallback(async () => {
    setActiveAction('ats');
    setError(null);
    try {
      const result = await analyzeCvWithATS(jobDescription, cvText);
      setAtsReport(result);
    } catch (e: any) {
      setError(e.message || 'An unexpected error occurred.');
      setAppState('error');
    } finally {
      setActiveAction(null);
    }
  }, [jobDescription, cvText]);

  const handleOptimizeCv = useCallback(async () => {
    setActiveAction('cv');
    setError(null);
    try {
      const cvBody = await optimizeCv(jobDescription, cvText);
      
      let cvHeader = '';
      if (cvDetails) {
          cvHeader = [
              cvDetails.name,
              cvDetails.address,
              `${cvDetails.phone} | ${cvDetails.email}`,
              cvDetails.linkedin
          ].filter(Boolean).join('\n') + '\n\n';
      }

      const fullOptimizedCv = cvHeader + cvBody;
      setOptimizedCv(fullOptimizedCv);
    } catch (e: any) {
      setError(e.message || 'An unexpected error occurred.');
      setAppState('error');
    } finally {
      setActiveAction(null);
    }
  }, [jobDescription, cvText, cvDetails]);
  
  const isGenerateButtonDisabled = !!activeAction || isProcessingFile || !jobDescription || !cvText || isExtractingCvDetails || isExtractingJobInfo || !cvDetails || !jobInfo;
  const isActionButtonDisabled = !!activeAction;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans">
      <Header />
      <main className="container mx-auto max-w-4xl p-4 pt-28 pb-48">
        <form onSubmit={handleGenerateCoverLetter} className="space-y-6">

          <FormSection 
            number={1} 
            title="Job Description" 
            isExtracting={isExtractingJobInfo}
            extractionText="Extracting role & company..."
          >
            <textarea
              id="job-description"
              rows={10}
              className="w-full p-4 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="Paste the full job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              disabled={!!activeAction || isProcessingFile}
            />
          </FormSection>
          
          <FormSection 
            number={2} 
            title="Your CV"
            isExtracting={isExtractingCvDetails}
            extractionText="Extracting contact info..."
          >
            <label
              htmlFor="cv-upload-input"
              className="w-full flex justify-center items-center p-6 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 transition-colors"
            >
              <div className="text-center">
                {isProcessingFile ? (
                  <>
                    <SpinnerIcon className="mx-auto h-12 w-12 text-slate-500" />
                    <p className="mt-2 text-sm text-blue-400 font-semibold">{processingMessage || 'Processing...'}</p>
                  </>
                ) : (
                  <>
                    <UploadIcon className="mx-auto h-12 w-12 text-slate-500" />
                    <p className="mt-2 text-sm text-slate-400">
                      <span className="font-semibold text-blue-400">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-slate-500 mt-1">PDF, TXT, or MD files supported</p>
                    {fileName && <p className="text-sm text-green-400 mt-2 font-medium">{fileName}</p>}
                  </>
                )}
              </div>
              <input
                id="cv-upload-input"
                type="file"
                className="sr-only"
                onChange={handleFileChange}
                accept=".txt,.md,text/plain,.pdf"
                disabled={!!activeAction || isProcessingFile}
              />
            </label>
          </FormSection>


          <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/80 backdrop-blur-sm border-t border-slate-700 z-10">
            <div className="container mx-auto max-w-4xl">
              <button
                type="submit"
                disabled={isGenerateButtonDisabled}
                className="w-full flex items-center justify-center py-4 px-6 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed disabled:text-slate-400 transition-all transform hover:scale-105 disabled:scale-100"
              >
                {activeAction === 'cover-letter' && <SpinnerIcon className="w-6 h-6 mr-3" />}
                {activeAction === 'cover-letter' ? 'Generating...' : 'Generate Cover Letter'}
              </button>
            </div>
          </div>
        </form>
        
        <div className="mt-12">
            {appState === 'error' && error && (
                <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg animate-fade-in" role="alert">
                    <p className="font-bold">Error</p>
                    <p>{error}</p>
                </div>
            )}
            {appState === 'success' && coverLetter && (
                <ResultCard title="Your Generated Cover Letter" content={coverLetter} />
            )}
            
            {appState === 'success' && (
              <div className="mt-8 p-6 bg-slate-800/50 border border-slate-700 rounded-lg animate-fade-in">
                <h3 className="text-lg font-semibold text-white mb-4">Next Steps</h3>
                <p className="text-sm text-slate-400 mb-6">Take your application to the next level.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleAnalyzeATS}
                    disabled={isActionButtonDisabled || !!atsReport}
                    className="flex-1 flex items-center justify-center py-3 px-4 text-base font-semibold text-white bg-indigo-600 rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed disabled:text-slate-400 transition-colors"
                  >
                    {activeAction === 'ats' ? <SpinnerIcon className="w-5 h-5 mr-2" /> : <ChartBarIcon className="w-5 h-5 mr-2" />}
                    {activeAction === 'ats' ? 'Analyzing...' : (atsReport ? 'Analysis Complete' : 'Analyze CV with ATS')}
                  </button>
                  <button
                    onClick={handleOptimizeCv}
                    disabled={isActionButtonDisabled || !!optimizedCv}
                    className="flex-1 flex items-center justify-center py-3 px-4 text-base font-semibold text-white bg-purple-600 rounded-lg shadow-md hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed disabled:text-slate-400 transition-colors"
                  >
                    {activeAction === 'cv' ? <SpinnerIcon className="w-5 h-5 mr-2" /> : <WandIcon className="w-5 h-5 mr-2" />}
                    {activeAction === 'cv' ? 'Optimizing...' : (optimizedCv ? 'CV Optimized' : 'Optimize CV for this Role')}
                  </button>
                </div>
              </div>
            )}

            {atsReport && <ATSScoreCard report={atsReport} />}
            {optimizedCv && <ResultCard title="Optimized CV" content={optimizedCv} />}
        </div>
      </main>
    </div>
  );
}
