import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PredictionResult as ApiPredictionResult } from '../services/api';
import { getSession, getSessionsByEmail } from '../lib/sessions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// EXPORT FUNCTIONS FOR CSV AND PDF
// ============================================================

// CSV Export function
const exportToCSV = (predictions: ApiPredictionResult[], fileName: string, hasSection: boolean) => {
    if (predictions.length === 0) return;

    // Only include prediction result fields - no probability breakdown or feature importance
    const csvHeaders = ['Learner ID', ...(hasSection ? ['Section'] : []), 'prediction', 'proficiency_label', 'pass_probability'];

    const csvRows = predictions.map(pred => [
        String(pred.learnerID || ''),
        ...(hasSection ? [pred.Section || ''] : []),
        pred.prediction?.toString() || '',
        pred.proficiency?.label || '',
        pred.pass_probability != null ? (pred.pass_probability * 100).toFixed(1) + '%' : '',
    ].join(','));

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName.replace(/\.csv$/i, '')}_predictions.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// PDF Export function - generates downloadable PDF
const exportToPDF = (predictions: ApiPredictionResult[], fileName: string, sessionName?: string, hasSection?: boolean) => {
    if (predictions.length === 0) return;

    // Create new PDF document
    const doc = new jsPDF();

    // Add title (use sessionName if available)
    doc.setFontSize(18);
    doc.text(`${sessionName ?? ''} Prediction Results Report`, 14, 22);

    // Add metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Total Records: ${predictions.length}`, 14, 36);

    // Prepare table data

    const tableData = predictions.map(pred => [
        pred.learnerID || '-',
        ...(hasSection ? [pred.Section || '-'] : []),
        pred.prediction?.toString() || '-',
        pred.proficiency?.label || '-',
        pred.pass_probability != null ? `${(pred.pass_probability * 100).toFixed(1)}%` : '-',
    ]);

    // Create table
    autoTable(doc, {
        head: [['Learner ID', ...(hasSection ? ['Section'] : []), 'Predicted MPS', 'Proficiency Level', 'Pass Probability']],
        body: tableData,
        startY: 42,
        styles: {
            fontSize: 9,
            cellPadding: 3,
            overflow: 'linebreak'
        },
        headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [240, 240, 240]
        },
        margin: { left: 14, right: 14 }
    });

    // Save the PDF
    doc.save(`${fileName.replace(/\.pdf$/i, '')}_predictions.pdf`);
};

// ============================================================
// FEATURE IMPORTANCE EXPLANATIONS FOR NON-TECHNICAL USERS
// ============================================================

// Map technical column names to user-friendly descriptions
export const featureExplanations: Record<string, {
    friendlyName: string;
    category: string;
    description: string;
    canChange: boolean;
    insight: string;
}> = {
    'Age': {
        friendlyName: 'Age',
        category: 'Student Profile',
        description: 'The student\'s age at the time of assessment',
        canChange: false,
        insight: 'Age can affect cognitive development and learning readiness.'
    },
    'Sex': {
        friendlyName: 'Gender',
        category: 'Student Profile',
        description: 'The student\'s gender',
        canChange: false,
        insight: 'Gender may influence learning styles and academic interests.'
    },
    'Mother Tongue': {
        friendlyName: 'Mother Tongue',
        category: 'Student Profile',
        description: 'The student\'s primary language at home',
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Nutritional Status(BMI)': {
        friendlyName: 'BMI / Nutritional Status',
        category: 'Student Profile',
        description: 'The student\'s body mass index and nutritional condition',
        canChange: false,
        insight: 'Physical health and nutrition can influence concentration and learning ability.'
    },
    // One-hot encoded categorical features
    'Sex_F': {
        friendlyName: 'Female',
        category: 'Student Profile',
        description: 'Student is female (gender identifier)',
        canChange: false,
        insight: 'Gender may influence learning styles and academic interests.'
    },
    'Sex_M': {
        friendlyName: 'Male',
        category: 'Student Profile',
        description: 'Student is male (gender identifier)',
        canChange: false,
        insight: 'Gender may influence learning styles and academic interests.'
    },
    'Mother Tongue_Ilocano': {
        friendlyName: 'Mother Tongue: Ilocano',
        category: 'Student Profile',
        description: "Student's primary language at home is Ilocano",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_Kamayo': {
        friendlyName: 'Mother Tongue: Kamayo',
        category: 'Student Profile',
        description: "Student's primary language at home is Kamayo",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_Tagalog': {
        friendlyName: 'Mother Tongue: Tagalog',
        category: 'Student Profile',
        description: "Student's primary language at home is Tagalog",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_Filipino': {
        friendlyName: 'Mother Tongue: Tagalog',
        category: 'Student Profile',
        description: "Student's primary language at home is Tagalog",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_Iloko': {
        friendlyName: 'Mother Tongue: Ilocano',
        category: 'Student Profile',
        description: "Student's primary language at home is Ilocano",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_Pangasinan': {
        friendlyName: 'Mother Tongue: Pangasinan',
        category: 'Student Profile',
        description: "Student's primary language at home is Pangasinan",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_Maranao': {
        friendlyName: 'Mother Tongue: Maranao',
        category: 'Student Profile',
        description: "Student's primary language at home is Maranao",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_English': {
        friendlyName: 'Mother Tongue: English',
        category: 'Student Profile',
        description: "Student's primary language at home is English",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_Kapampangan': {
        friendlyName: 'Mother Tongue: Kapampangan',
        category: 'Student Profile',
        description: "Student's primary language at home is Kapampangan",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_Hiligaynon': {
        friendlyName: 'Mother Tongue: Hiligaynon',
        category: 'Student Profile',
        description: "Student's primary language at home is Hiligaynon",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Mother Tongue_Cebuano / Sinugbuanong Binisay': {
        friendlyName: 'Mother Tongue: Cebuano / Sinugbuanong Binisay',
        category: 'Student Profile',
        description: "Student's primary language at home is Cebuano / Sinugbuanong Binisay",
        canChange: false,
        insight: 'Language background can affect performance in language-related subjects.'
    },
    'Nutritional Status(BMI)_Normal': {
        friendlyName: 'Nutritional Status: Normal',
        category: 'Student Profile',
        description: 'Student has normal nutritional status',
        canChange: false,
        insight: 'Physical health and nutrition can influence concentration and learning ability.'
    },
    'Nutritional Status(BMI)_Overweight': {
        friendlyName: 'Nutritional Status: Overweight',
        category: 'Student Profile',
        description: 'Student is overweight',
        canChange: false,
        insight: 'Weight management can impact energy levels and academic performance.'
    },
    'Nutritional Status(BMI)_Severely Wasted': {
        friendlyName: 'Nutritional Status: Severely Wasted',
        category: 'Student Profile',
        description: 'Student is severely wasted (underweight)',
        canChange: false,
        insight: 'Nutritional deficiencies can significantly affect cognitive function and learning.'
    },
    'Nutritional Status(BMI)_Wasted': {
        friendlyName: 'Nutritional Status: Wasted',
        category: 'Student Profile',
        description: 'Student is wasted (underweight)',
        canChange: false,
        insight: 'Nutritional deficiencies can affect concentration and academic performance.'
    },
    'Nutritional Status(BMI)_Obese': {
        friendlyName: 'Nutritional Status: Obese',
        category: 'Student Profile',
        description: 'Student is obese',
        canChange: false,
        insight: 'Weight management can impact energy levels, focus, and academic performance.'
    },
    'Nutritional Status(BMI)_Severely  Wasted': {
        friendlyName: 'Nutritional Status: Severely Wasted (double-space variant)',
        category: 'Student Profile',
        description: 'Student is severely wasted (data entry variant with extra space)',
        canChange: false,
        insight: 'This is a data entry variant; same health implications as severely wasted.'
    },
    // Grade 1 subjects
    'Math 1': {
        friendlyName: 'Grade 1 - Math',
        category: 'Academic History',
        description: 'Final Math grade from Grade 1 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s math performance in Grade 1. Past grades cannot be changed but show the student\'s academic foundation.'
    },
    'English 1': {
        friendlyName: 'Grade 1 - English',
        category: 'Academic History',
        description: 'Final English grade from Grade 1 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s English performance in Grade 1. Past grades cannot be changed but show the student\'s language foundation.'
    },
    'Filipino 1': {
        friendlyName: 'Grade 1 - Filipino',
        category: 'Academic History',
        description: 'Final Filipino grade from Grade 1 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s Filipino performance in Grade 1. Past grades cannot be changed.'
    },
    'Aral Pan 1': {
        friendlyName: 'Grade 1 - Araling Panlipunan',
        category: 'Academic History',
        description: 'Final Araling Panlipunan grade from Grade 1 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s social studies performance in Grade 1. Past grades cannot be changed.'
    },
    // Grade 2 subjects
    'Math 2': {
        friendlyName: 'Grade 2 - Math',
        category: 'Academic History',
        description: 'Final Math grade from Grade 2 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s math performance in Grade 2. Shows progression from Grade 1.'
    },
    'English 2': {
        friendlyName: 'Grade 2 - English',
        category: 'Academic History',
        description: 'Final English grade from Grade 2 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s English performance in Grade 2. Shows progression from Grade 1.'
    },
    'Filipino 2': {
        friendlyName: 'Grade 2 - Filipino',
        category: 'Academic History',
        description: 'Final Filipino grade from Grade 2 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s Filipino performance in Grade 2. Shows progression from Grade 1.'
    },
    'Aral Pan 2': {
        friendlyName: 'Grade 2 - Araling Panlipunan',
        category: 'Academic History',
        description: 'Final Araling Panlipunan grade from Grade 2 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s social studies performance in Grade 2. Shows progression from Grade 1.'
    },
    // Grade 3 subjects
    'Math 3': {
        friendlyName: 'Grade 3 - Math',
        category: 'Academic History',
        description: 'Final Math grade from Grade 3 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s math performance in Grade 3. Shows academic trajectory.'
    },
    'English 3': {
        friendlyName: 'Grade 3 - English',
        category: 'Academic History',
        description: 'Final English grade from Grade 3 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s English performance in Grade 3. Shows academic trajectory.'
    },
    'Science 3': {
        friendlyName: 'Grade 3 - Science',
        category: 'Academic History',
        description: 'Final Science grade from Grade 3 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s science performance in Grade 3. Science was introduced in Grade 3.'
    },
    'Filipino 3': {
        friendlyName: 'Grade 3 - Filipino',
        category: 'Academic History',
        description: 'Final Filipino grade from Grade 3 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s Filipino performance in Grade 3.'
    },
    'Aral Pan 3': {
        friendlyName: 'Grade 3 - Araling Panlipunan',
        category: 'Academic History',
        description: 'Final Araling Panlipunan grade from Grade 3 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s social studies performance in Grade 3.'
    },
    // Grade 4 subjects
    'Math 4': {
        friendlyName: 'Grade 4 - Math',
        category: 'Academic History',
        description: 'Final Math grade from Grade 4 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s math performance in Grade 4. Shows recent academic performance.'
    },
    'English 4': {
        friendlyName: 'Grade 4 - English',
        category: 'Academic History',
        description: 'Final English grade from Grade 4 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s English performance in Grade 4. Shows recent academic performance.'
    },
    'Science 4': {
        friendlyName: 'Grade 4 - Science',
        category: 'Academic History',
        description: 'Final Science grade from Grade 4 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s science performance in Grade 4. Shows recent performance in science.'
    },
    'Filipino 4': {
        friendlyName: 'Grade 4 - Filipino',
        category: 'Academic History',
        description: 'Final Filipino grade from Grade 4 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s Filipino performance in Grade 4. Shows recent performance.'
    },
    'Aral Pan 4': {
        friendlyName: 'Grade 4 - Araling Panlipunan',
        category: 'Academic History',
        description: 'Final Araling Panlipunan grade from Grade 4 (Past Performance)',
        canChange: false,
        insight: 'This is a historical record of the student\'s social studies performance in Grade 4. Shows recent performance.'
    },
    // Grade 5 subjects
    'Math 5': {
        friendlyName: 'Grade 5 - Math',
        category: 'Academic History',
        description: 'Final Math grade from Grade 5 (Most Recent Performance)',
        canChange: false,
        insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
    },
    'English 5': {
        friendlyName: 'Grade 5 - English',
        category: 'Academic History',
        description: 'Final English grade from Grade 5 (Most Recent Performance)',
        canChange: false,
        insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
    },
    'Science 5': {
        friendlyName: 'Grade 5 - Science',
        category: 'Academic History',
        description: 'Final Science grade from Grade 5 (Most Recent Performance)',
        canChange: false,
        insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
    },
    'Filipino 5': {
        friendlyName: 'Grade 5 - Filipino',
        category: 'Academic History',
        description: 'Final Filipino grade from Grade 5 (Most Recent Performance)',
        canChange: false,
        insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
    },
    'Aral Pan 5': {
        friendlyName: 'Grade 5 - Araling Panlipunan',
        category: 'Academic History',
        description: 'Final Araling Panlipunan grade from Grade 5 (Most Recent Performance)',
        canChange: false,
        insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
    },
    // Averaged subject columns (new format)
    'Math_avg': {
        friendlyName: 'Math (Average across Grades 1-5)',
        category: 'Academic History',
        description: 'Average Math grade across all grade levels (Grades 1-5)',
        canChange: false,
        insight: 'This represents the student\'s consistent performance in Math across all grades. It provides a comprehensive view of math ability over time.'
    },
    'English_avg': {
        friendlyName: 'English (Average across Grades 1-5)',
        category: 'Academic History',
        description: 'Average English grade across all grade levels (Grades 1-5)',
        canChange: false,
        insight: 'This represents the student\'s consistent performance in English across all grades. It provides a comprehensive view of English ability over time.'
    },
    'Filipino_avg': {
        friendlyName: 'Filipino (Average across Grades 1-5)',
        category: 'Academic History',
        description: 'Average Filipino grade across all grade levels (Grades 1-5)',
        canChange: false,
        insight: 'This represents the student\'s consistent performance in Filipino across all grades. It provides a comprehensive view of Filipino ability over time.'
    },
    'Science_avg': {
        friendlyName: 'Science (Average across Grades 3-5)',
        category: 'Academic History',
        description: 'Average Science grade (Science is taught from Grade 3 onwards)',
        canChange: false,
        insight: 'This represents the student\'s performance in Science across Grades 3-5. Science is introduced in Grade 3, so this average covers all available science grades.'
    },
    'Aral Pan_avg': {
        friendlyName: 'Araling Panlipunan (Average across Grades 1-5)',
        category: 'Academic History',
        description: 'Average Araling Panlipunan grade across all grade levels (Grades 1-5)',
        canChange: false,
        insight: 'This represents the student\'s consistent performance in Araling Panlipunan across all grades. It provides a comprehensive view of social studies ability over time.'
    }
};

// Get a user-friendly name for any feature
export const getFriendlyFeatureName = (featureName: string): string => {
    return featureExplanations[featureName]?.friendlyName || featureName;
};

// Get category color for display - all categories now merged into Student Profile
export const getCategoryColor = (category: string): string => {
    // All categories now use Student Profile color
    const colors: Record<string, string> = {
        'Student Profile': '#8b5cf6',
        'Academic History': '#8b5cf6',
        'Other': '#8b5cf6'
    };
    return colors[category] || '#8b5cf6';
};

// Fallback category detection based on feature name patterns
export function getFeatureCategory(featureName: string): string {
    const info = featureExplanations[featureName];
    if (info) return info.category;

    const lower = featureName.toLowerCase();

    // Academic subjects and grades
    if (lower.includes('math') || lower.includes('english') || lower.includes('filipino') || lower.includes('science') || lower.includes('aral')) {
        return 'Academic History';
    }

    // Student profile fields
    if (lower.includes('age') || lower.includes('sex') || lower.includes('gender') || lower.includes('mother tongue') || lower.includes('nutrition') || lower.includes('bmi')) {
        return 'Student Profile';
    }

    // One-hot encoded variants
    if (lower.startsWith('sex_') || lower.startsWith('mother tongue_') || lower.startsWith('nutritional status(bmi)_')) {
        return 'Student Profile';
    }

    return 'Other';
}

interface ResultsState {
    predictions: ApiPredictionResult[];
    fileName: string;
    sessionId?: string;
    sessionName?: string;
    rawData?: Record<string, unknown>[];
}

export function Results() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const [predictions, setPredictions] = useState<ApiPredictionResult[]>([]);
    const [fileName, setFileName] = useState('');
    const [sessionName, setSessionName] = useState('');
    const [sortField, setSortField] = useState<keyof ApiPredictionResult>('prediction');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed'>('all');
    const [filterProficiency, setFilterProficiency] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
    const [pageInput, setPageInput] = useState('');
    const [isFeatureDashboardOpen, setIsFeatureDashboardOpen] = useState(false);
    const [, setRawData] = useState<Record<string, unknown>[]>([]);
    const [hasAnySession, setHasAnySession] = useState(false);
    const resultsContainerRef = useRef<HTMLDivElement>(null);
    const hasSection = predictions.some(p => p.Section != null && p.Section !== '');

    // Check if user has any sessions (uploaded datasets)
    useEffect(() => {
        if (user) {
            const userSessions = getSessionsByEmail(user.email);
            setHasAnySession(userSessions.length > 0);
        }
    }, [user]);

    // ============================================================
    // AGGREGATED FEATURE IMPORTANCE CALCULATION
    // ============================================================

    interface AggregatedFeature {
        feature: string;
        avgShap: number;
        avgAbsShap: number;
        count: number;
        positiveCount: number;
        negativeCount: number;
    }

    interface CategoryBreakdownItem {
        category: string;
        count: number;
        totalImpact: number;
        color: string;
    }

    // Calculate aggregated feature importance from all predictions
    const aggregatedFeatureImportance = React.useMemo(() => {
        if (!predictions.length || !predictions[0]?.explanation?.features) {
            return [];
        }

        const featureMap = new Map<string, AggregatedFeature>();

        predictions.forEach(pred => {
            if (!pred.explanation?.features) return;

            pred.explanation.features.forEach((shapFeature: { feature: string; shap_value: number }) => {
                const { feature, shap_value } = shapFeature;

                if (!featureMap.has(feature)) {
                    featureMap.set(feature, {
                        feature,
                        avgShap: 0,
                        avgAbsShap: 0,
                        count: 0,
                        positiveCount: 0,
                        negativeCount: 0
                    });
                }

                const current = featureMap.get(feature)!;
                current.count++;
                current.avgShap += shap_value;
                current.avgAbsShap += Math.abs(shap_value);
                if (shap_value > 0) {
                    current.positiveCount++;
                } else {
                    current.negativeCount++;
                }
            });
        });

        // Calculate averages and sort by absolute importance
        const aggregated = Array.from(featureMap.values()).map(item => ({
            ...item,
            avgShap: item.avgShap / item.count,
            avgAbsShap: item.avgAbsShap / item.count
        }));

        // Sort by absolute SHAP value (most important first)
        return aggregated.sort((a, b) => b.avgAbsShap - a.avgAbsShap);
    }, [predictions]);

    // Calculate category breakdown
    const categoryBreakdown = React.useMemo((): CategoryBreakdownItem[] => {
        if (!aggregatedFeatureImportance.length) return [];

        const categoryMap = new Map<string, CategoryBreakdownItem>();

        aggregatedFeatureImportance.forEach(item => {
            // All features are categorized as Student Profile for consistent display
            const category = 'Student Profile';
            const color = getCategoryColor('Student Profile');

            if (!categoryMap.has(category)) {
                categoryMap.set(category, {
                    category,
                    count: 0,
                    totalImpact: 0,
                    color
                });
            }

            const current = categoryMap.get(category)!;
            current.count++;
            current.totalImpact += item.avgAbsShap;
        });

        return Array.from(categoryMap.values()).sort((a, b) => b.totalImpact - a.totalImpact);
    }, [aggregatedFeatureImportance]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (selectedStudent) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [selectedStudent]);

    useEffect(() => {
        const loadResults = async () => {
            const state = location.state as ResultsState | null;

            if (state?.predictions) {
                // Load from navigation state (new predictions)
                setPredictions(state.predictions);
                setFileName(state.fileName || 'Dataset');
                setSessionName(state.sessionName || '');
                if (state.rawData) {
                    setRawData(state.rawData);
                }
                // Predictions from explainBatch already include explanations
            } else if (state?.sessionId) {
                // Try to load from session in localStorage
                try {
                    const session = await getSession(state.sessionId);

                    if (!session) {
                        navigate('/home');
                        return;
                    }

                    if (session.predictions && Array.isArray(session.predictions) && session.predictions.length > 0) {
                        // Handle case where predictions might be stored as string or array
                        let loadedPredictions: ApiPredictionResult[] = Array.isArray(session.predictions)
                            ? session.predictions
                            : JSON.parse(session.predictions as string);
                        setFileName(session.file_name || 'Dataset');
                        setSessionName(session.name || '');

                        setPredictions(loadedPredictions);
                    } else {
                        navigate('/home');
                    }
                } catch (error) {
                    console.error('Failed to load session:', error);
                    navigate('/home');
                }
            } else {
                // No state, redirect to home
                navigate('/home');
            }
        };

        loadResults();
    }, [location.state, navigate]);

    const handleSort = (field: keyof ApiPredictionResult) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Get unique proficiency labels for filter
    const uniqueProficiencies = React.useMemo(() => {
        const profSet = new Set<string>();
        predictions.forEach(pred => {
            if (pred.proficiency?.label) {
                profSet.add(pred.proficiency.label);
            }
        });
        return Array.from(profSet).sort();
    }, [predictions]);

    const filteredAndSortedPredictions = predictions
        .filter((pred) => {
            // Band filter - filter by top probable band
            if (filterStatus === 'all') return true;
            // If filterStatus is a number (band code), filter by that band
            const bandCode = parseInt(filterStatus);
            if (!isNaN(bandCode)) {
                return pred.top_probable_band?.code === bandCode;
            }
            // Default: use passed/failed logic
            const isPassed = (pred.proficiency?.code ?? 0) >= 2;
            if (filterStatus === 'passed') return isPassed;
            if (filterStatus === 'failed') return !isPassed;
            return true;
        })
        .filter((pred) => {
            // Proficiency filter
            if (filterProficiency === 'all') return true;
            return pred.proficiency?.label === filterProficiency;
        })
        .filter((pred) => {
            // Search filter
            if (!searchQuery.trim()) return true;
            const query = searchQuery.toLowerCase();
            return (
                (String(pred.learnerID)?.toLowerCase()?.includes(query)) ||
                (pred.School?.toLowerCase().includes(query)) ||
                (pred.Section?.toLowerCase().includes(query)) ||
                (pred.proficiency?.label?.toLowerCase().includes(query))
            );
        })
        .sort((a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];

            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
            }

            const aStr = String(aValue).toLowerCase();
            const bStr = String(bValue).toLowerCase();
            return sortDirection === 'asc'
                ? aStr.localeCompare(bStr)
                : bStr.localeCompare(aStr);
        });


    const totalPredictions = predictions.length;
    const avgPassPct = totalPredictions > 0 && predictions?.length > 0 && predictions[0]?.pass_probability != null
        ? (predictions.reduce((sum, p) => sum + (p.pass_probability ?? 0), 0) / totalPredictions) * 100
        : null;

    const isGood = avgPassPct !== null && avgPassPct >= 50;


    // Consider passed if proficiency code >= 2 (Nearly Proficient or above)
    const passedCount = predictions.filter((p) => (p.proficiency?.code ?? 0) >= 2).length;
    const failedCount = totalPredictions - passedCount;
    const averageScore = totalPredictions > 0
        ? predictions.reduce((sum, p) => sum + p.prediction, 0) / totalPredictions
        : 0;
    const highestScore = totalPredictions > 0
        ? Math.max(...predictions.map((p) => p.prediction))
        : 0;
    const lowestScore = totalPredictions > 0
        ? Math.min(...predictions.map((p) => p.prediction))
        : 0;

    if (predictions.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="rounded-full bg-yellow-100 w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">No Dataset Uploaded</h2>
                    <p className="text-gray-600 mb-6">
                        {hasAnySession
                            ? "You have previous sessions, but no dataset is available in this session. Would you like to start a new analysis or return to your dashboard?"
                            : "You need to upload a dataset first before viewing prediction results. Go to the Dashboard to upload your data."
                        }
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={() => {
                                if (hasAnySession) {
                                    navigate('/dashboard');
                                } else {
                                    navigate('/dashboard');
                                }
                            }}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
                        >
                            Go to Dashboard
                        </button>
                        {hasAnySession && (
                            <button
                                onClick={() => navigate('/home')}
                                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
                            >
                                Select Session
                            </button>
                        )}
                    </div>
                    {!hasAnySession && (
                        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-700">
                                Tip: Click "Go to Dashboard" above, then use the file upload section to upload your CSV dataset and run predictions.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8" ref={resultsContainerRef}>
            {/* Page Header with Export Options */}
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px', background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)', borderRadius: '16px', color: '#fff' }}>
                <div className="header-content">
                    <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700' }}>Prediction Results</h1>
                    <p style={{ margin: 0, opacity: 0.9, fontSize: '14px' }}>
                        {sessionName && <span style={{ fontWeight: 600 }}>Session: {sessionName}</span>}
                        {sessionName && <span style={{ margin: '0 8px' }}>|</span>}
                        {fileName} - {totalPredictions} predictions generated
                    </p>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => exportToCSV(predictions, fileName, hasSection)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '8px', color: '#fff', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export CSV
                    </button>
                    <button
                        onClick={() => exportToPDF(predictions, fileName, sessionName)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '8px', color: '#fff', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download PDF
                    </button>
                </div>
            </header>

            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl shadow-lg p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Total Learners</p>
                            <p className="text-3xl font-bold text-gray-900 mt-1">{totalPredictions}</p>
                        </div>
                        <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {predictions[0]?.probability_breakdown && predictions[0].probability_breakdown.length > 0 ? (
                    predictions[0].probability_breakdown
                        .map(band => {
                            const count = predictions.filter(p => p.top_probable_band?.code === band.code).length;
                            return { band, count };
                        })
                        .filter(item => item.count > 0)
                        .map((item, idx) => {
                            const { band, count } = item;
                            const pct = totalPredictions > 0 ? (count / totalPredictions) * 100 : 0;
                            return (
                                <div key={idx} className="bg-white rounded-2xl shadow-lg p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500">{band.label}</p>
                                            <p className="text-3xl font-bold mt-1" style={{ color: band.color }}>{count}</p>
                                            <p className="text-sm text-gray-500">{pct.toFixed(1)}%</p>
                                        </div>
                                        <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: band.color + '20' }}>
                                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: band.color }}>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                ) : (
                    <>
                        {passedCount !== 0 && (
                            <div className="bg-white rounded-2xl shadow-lg p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Passed</p>
                                        <p className="text-3xl font-bold text-green-600 mt-1">{passedCount}</p>
                                    </div>
                                    <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
                                        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        )}
                        {failedCount !== 0 && (
                            <div className="bg-white rounded-2xl shadow-lg p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Failed</p>
                                        <p className="text-3xl font-bold text-red-600 mt-1">{failedCount}</p>
                                    </div>
                                    <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                                        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* MPS Distribution */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">MPS Distribution</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                        <p className="text-sm font-medium text-blue-600">Highest MPS</p>
                        <p className="text-2xl font-bold text-blue-700 mt-1">{(highestScore ?? 0).toFixed(1)}</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
                        <p className="text-sm font-medium text-purple-600">Average MPS</p>
                        <p className="text-2xl font-bold text-purple-700 mt-1">{(averageScore ?? 0).toFixed(1)}</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
                        <p className="text-sm font-medium text-orange-600">Lowest MPS</p>
                        <p className="text-2xl font-bold text-orange-700 mt-1">{(lowestScore ?? 0).toFixed(1)}</p>
                    </div>
                    <div className={`p-4 rounded-xl ${isGood ? 'bg-gradient-to-br from-green-50 to-green-100' : 'bg-gradient-to-br from-red-50 to-red-100'}`}>
                        <div>
                            <p className={`text-sm font-medium ${isGood ? 'text-green-600' : 'text-red-600'}`}>Avg Pass Probability</p>
                            <p className={`text-2xl font-bold mt-1 ${isGood ? 'text-green-700' : 'text-red-700'}`}>
                                {avgPassPct !== null ? `${avgPassPct.toFixed(1)}%` : 'N/A'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>


            {/* Aggregated Feature Importance Dashboard */}
            {predictions[0]?.explanation && predictions[0].explanation.top_drivers && predictions[0].explanation.top_drivers.length > 0 && (
                <div className="feature-dashboard bg-white rounded-2xl shadow-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Feature Importance Dashboard</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Aggregated feature importance based on SHAP values from all {totalPredictions} predictions
                            </p>
                        </div>
                        <button
                            onClick={() => setIsFeatureDashboardOpen(!isFeatureDashboardOpen)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                        >
                            <svg
                                className={`h-5 w-5 transition-transform ${isFeatureDashboardOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            {isFeatureDashboardOpen ? 'Collapse' : 'Expand'}
                        </button>
                    </div>

                    {/* What is SHAP? Help Section */}
                    <div className="mb-4">
                        <details className="group">
                            <summary className="flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="font-medium">What are SHAP values?</span>
                                <svg className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            <div className="mt-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                                <div className="space-y-3 text-sm text-gray-700">
                                    <p>
                                        <strong className="text-blue-800">SHAP (SHapley Additive exPlanations)</strong> is a method that explains how each feature contributes to a prediction. Think of it as a "scorecard" that shows which factors pushed the prediction up or down.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white/60 p-3 rounded-lg">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                                                <span className="font-semibold text-green-700">Positive Impact (↑)</span>
                                            </div>
                                            <p className="text-xs text-gray-600">
                                                These factors helped increase the predicted score. For example, strong past grades in Math would push the prediction higher.
                                            </p>
                                        </div>
                                        <div className="bg-white/60 p-3 rounded-lg">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                                                <span className="font-semibold text-red-700">Negative Impact (↓)</span>
                                            </div>
                                            <p className="text-xs text-gray-600">
                                                These factors contributed to lowering the predicted score. For example, lower grades in previous years would push the prediction lower.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                                        <p className="text-xs text-yellow-800">
                                            <strong className="font-semibold">📚 Important:</strong> Most features shown are from historical academic data (past grades from Grades 1-5). These are records of past performance and cannot be changed, but they help predict future outcomes so teachers can provide appropriate support.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>

                    {isFeatureDashboardOpen && (
                        <>
                            {/* Top Feature Importance Bar Chart */}
                            <div className="mb-8">
                                <h3 className="text-md font-medium text-gray-700 mb-4">Top Contributing Features</h3>
                                <div className="space-y-3">
                                    {aggregatedFeatureImportance.slice(0, 10).map((item, idx) => {
                                        const maxAbs = Math.max(...aggregatedFeatureImportance.map(f => Math.abs(f.avgAbsShap)), 0.01);
                                        const width = maxAbs > 0 ? (Math.abs(item.avgAbsShap) / maxAbs) * 100 : 0;
                                        const isPositive = item.avgShap > 0;

                                        return (
                                            <div key={idx} className="relative">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-medium text-gray-700">
                                                        {getFriendlyFeatureName(item.feature)}
                                                    </span>
                                                    <span className="text-sm text-gray-500">
                                                        Avg |SHAP|: {item.avgAbsShap.toFixed(3)}
                                                    </span>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                                                    <div
                                                        className={`h-3 rounded-full transition-all duration-500 ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                                                        style={{ width: `${width}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>


                        </>
                    )}
                </div>
            )}
            <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Prediction Results</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Showing {filteredAndSortedPredictions.length} of {totalPredictions} predictions
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Search Bar */}
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                placeholder="Search student ID, school..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                            />
                        </div>
                        {/* Band Filter */}
                        <select
                            value={filterStatus}
                            onChange={(e) => {
                                setFilterStatus(e.target.value as 'all' | 'passed' | 'failed');
                                setCurrentPage(1);
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Bands</option>
                            {predictions[0]?.probability_breakdown && predictions[0].probability_breakdown.map((band: { code: number; label: string; range: string; color: string; probability: number }, idx) => (
                                <option key={idx} value={band.code.toString()}>{band.label}</option>
                            ))}
                        </select>
                        {/* Proficiency Filter */}
                        <select
                            value={filterProficiency}
                            onChange={(e) => {
                                setFilterProficiency(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Proficiencies</option>
                            {uniqueProficiencies.map((prof) => (
                                <option key={prof} value={prof}>{prof}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            {/* Pagination */}
            {
                filteredAndSortedPredictions.length > itemsPerPage && (
                    <div className="bg-white rounded-2xl shadow-lg p-4">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="text-sm text-gray-500">
                                    Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredAndSortedPredictions.length)} of {filteredAndSortedPredictions.length}
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-500">Rows per page:</label>
                                    <select
                                        value={itemsPerPage}
                                        onChange={(e) => {
                                            setItemsPerPage(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                {/* First Page */}
                                <button
                                    onClick={() => {
                                        setCurrentPage(1);
                                        setPageInput('1');
                                    }}
                                    disabled={currentPage === 1}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                                    title="First Page"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                    </svg>
                                </button>
                                {/* Previous Page */}
                                <button
                                    onClick={() => {
                                        setCurrentPage((p) => Math.max(1, p - 1));
                                        setPageInput(String(Math.max(1, currentPage - 1)));
                                    }}
                                    disabled={currentPage === 1}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                                    title="Previous Page"
                                >
                                    Previous
                                </button>
                                {/* Page Input */}
                                <div className="flex items-center space-x-1">
                                    <input
                                        type="number"
                                        min={1}
                                        max={Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}
                                        value={pageInput}
                                        onChange={(e) => setPageInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const page = parseInt(pageInput);
                                                const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);
                                                if (!isNaN(page) && page >= 1 && page <= totalPages) {
                                                    setCurrentPage(page);
                                                } else {
                                                    setPageInput(String(currentPage));
                                                }
                                            }
                                        }}
                                        className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Page"
                                    />
                                    <span className="text-sm text-gray-500">of {Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}</span>
                                </div>
                                {/* Next Page */}
                                <button
                                    onClick={() => {
                                        const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);
                                        setCurrentPage((p) => Math.min(totalPages, p + 1));
                                        setPageInput(String(Math.min(totalPages, currentPage + 1)));
                                    }}
                                    disabled={currentPage >= Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                                    title="Next Page"
                                >
                                    Next
                                </button>
                                {/* Last Page */}
                                <button
                                    onClick={() => {
                                        const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);
                                        setCurrentPage(totalPages);
                                        setPageInput(String(totalPages));
                                    }}
                                    disabled={currentPage >= Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                                    title="Last Page"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Results Table */}
            <div className="feature-importance-section bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('learnerID')}
                                >
                                    <div className="flex items-center space-x-1">
                                        <span>Learner ID</span>
                                        {sortField === 'learnerID' && (
                                            <svg className={`h-4 w-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                            </svg>
                                        )}
                                    </div>
                                </th>
                                {hasSection && (
                                    <th
                                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                        onClick={() => handleSort('Section')}
                                    >
                                        <div className="flex items-center space-x-1">
                                            <span>Section</span>
                                            {sortField === 'Section' && (
                                                <svg className={`h-4 w-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                </svg>
                                            )}
                                        </div>
                                    </th>
                                )}
                                <th
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('prediction')}
                                >
                                    <div className="flex items-center space-x-1">
                                        <span>Predicted MPS</span>
                                        {sortField === 'prediction' && (
                                            <svg className={`h-4 w-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                            </svg>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                    <div className="flex items-center space-x-1">
                                        <span>Proficiency</span>
                                    </div>
                                </th>
                                <th
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                    <div className="flex items-center space-x-1">
                                        <span>Probability Breakdown</span>
                                    </div>
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Pass Probability <br />P(MPS ≥ 75)
                                </th>
                                <th
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                    <div className="flex items-center space-x-1">
                                        <span>Actions</span>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredAndSortedPredictions
                                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                                .map((result, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {result.learnerID || '-'}
                                        </td>
                                        {hasSection && (
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {result.Section || '-'}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            <span className={`font-semibold ${result.prediction >= 75 ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                {result.prediction.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span
                                                className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
                                                style={{
                                                    backgroundColor: result.proficiency?.color + '20',
                                                    color: result.proficiency?.color
                                                }}
                                            >
                                                {result.proficiency?.label || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {result.probability_breakdown && result.probability_breakdown.length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {result.probability_breakdown.map((band: { code: number; label: string; range: string; color: string; probability: number }, idx) => (
                                                        <div key={idx} className="flex items-center justify-between gap-2">
                                                            <span
                                                                className="px-2 py-0.5 text-xs rounded-full"
                                                                style={{
                                                                    backgroundColor: band.color + '20',
                                                                    color: band.color,
                                                                    border: result.top_probable_band?.code === band.code ? '2px solid ' + band.color : 'none'
                                                                }}
                                                            >
                                                                {band.label}
                                                            </span>
                                                            <span className="text-xs font-medium text-gray-600">
                                                                {(band.probability * 100).toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {/* {result.top_probable_band && (
                                                        <div className="mt-1 pt-1 border-t border-gray-200 text-xs text-gray-500">
                                                            Top: <span className="font-semibold">{result.top_probable_band.label}</span> ({(result.top_probable_band.probability * 100).toFixed(1)}%)
                                                        </div>
                                                    )} */}
                                                </div>
                                            ) : (
                                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${(result.proficiency?.code ?? 0) >= 2
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {(result.proficiency?.code ?? 0) >= 2 ? 'Passed' : 'Failed'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {result.pass_probability != null
                                                ? <span className={`font-semibold ${result.pass_probability >= 0.5 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {(result.pass_probability * 100).toFixed(1)}%
                                                </span>
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => setSelectedStudent((result.learnerID || ''))}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                            >
                                                Feature Importance
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {
                filteredAndSortedPredictions.length > itemsPerPage && (
                    <div className="bg-white rounded-2xl shadow-lg p-4">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="text-sm text-gray-500">
                                    Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredAndSortedPredictions.length)} of {filteredAndSortedPredictions.length}
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-500">Rows per page:</label>
                                    <select
                                        value={itemsPerPage}
                                        onChange={(e) => {
                                            setItemsPerPage(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                {/* First Page */}
                                <button
                                    onClick={() => {
                                        setCurrentPage(1);
                                        setPageInput('1');
                                    }}
                                    disabled={currentPage === 1}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                                    title="First Page"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                    </svg>
                                </button>
                                {/* Previous Page */}
                                <button
                                    onClick={() => {
                                        setCurrentPage((p) => Math.max(1, p - 1));
                                        setPageInput(String(Math.max(1, currentPage - 1)));
                                    }}
                                    disabled={currentPage === 1}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                                    title="Previous Page"
                                >
                                    Previous
                                </button>
                                {/* Page Input */}
                                <div className="flex items-center space-x-1">
                                    <input
                                        type="number"
                                        min={1}
                                        max={Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}
                                        value={pageInput}
                                        onChange={(e) => setPageInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const page = parseInt(pageInput);
                                                const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);
                                                if (!isNaN(page) && page >= 1 && page <= totalPages) {
                                                    setCurrentPage(page);
                                                } else {
                                                    setPageInput(String(currentPage));
                                                }
                                            }
                                        }}
                                        className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Page"
                                    />
                                    <span className="text-sm text-gray-500">of {Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}</span>
                                </div>
                                {/* Next Page */}
                                <button
                                    onClick={() => {
                                        const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);
                                        setCurrentPage((p) => Math.min(totalPages, p + 1));
                                        setPageInput(String(Math.min(totalPages, currentPage + 1)));
                                    }}
                                    disabled={currentPage >= Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                                    title="Next Page"
                                >
                                    Next
                                </button>
                                {/* Last Page */}
                                <button
                                    onClick={() => {
                                        const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);
                                        setCurrentPage(totalPages);
                                        setPageInput(String(totalPages));
                                    }}
                                    disabled={currentPage >= Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                                    title="Last Page"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Per-Student Feature Importance Modal */}
            {
                selectedStudent && (
                    <div className="per-student-feature-modal fixed inset-0 z-50 flex items-center justify-center p-4">
                        {/* Dimmed Background Overlay */}
                        <div
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm min-h-screen w-full"
                            onClick={() => setSelectedStudent(null)}
                        />
                        {/* Modal Content */}
                        <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden">
                            <div className="p-6 border-b border-gray-200">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        Feature Importance for Student - {predictions.find(p => p.learnerID === selectedStudent)?.learnerID || selectedStudent}
                                    </h3>
                                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded-lg">
                                        <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>These are historical grades (Past Performance) - they cannot be changed but help predict future scores.</span>
                                    </div>
                                    <button
                                        onClick={() => setSelectedStudent(null)}
                                        className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition"
                                    >
                                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div className="p-6 overflow-y-auto max-h-[65vh]">
                                {/* What is this section? */}
                                <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
                                    <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center">
                                        <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        Important: These are Historical Grades
                                    </h4>
                                    <p className="text-sm text-amber-700 mb-3">
                                        The features shown below are <strong>past grades from Grades 1-5</strong>. These cannot be changed or improved - they are simply records of the student's academic history that help predict future performance.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="flex items-start">
                                            <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2 mt-0.5"></span>
                                            <div>
                                                <span className="font-semibold text-green-700">Positive (Green)</span>
                                                <p className="text-green-600">Past performance that helped predict a higher score</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start">
                                            <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2 mt-0.5"></span>
                                            <div>
                                                <span className="font-semibold text-red-700">Negative (Red)</span>
                                                <p className="text-red-600">Past performance patterns that correlated with lower scores</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {predictions.length > 0 && predictions[0].explanation ? (
                                    <div className="space-y-4">
                                        {(() => {
                                            const selectedPrediction = predictions.find(
                                                p => p.learnerID === selectedStudent ||
                                                    `row-${predictions.findIndex(pp => pp.learnerID === selectedStudent)}` === String(selectedStudent)
                                            );

                                            if (selectedPrediction && selectedPrediction.explanation) {
                                                const explanation = selectedPrediction.explanation;
                                                return (
                                                    <>
                                                        {/* Top Drivers */}
                                                        <div>
                                                            <h5 className="text-sm font-semibold text-gray-700 mb-3">Top Influencing Factors</h5>
                                                            {explanation.top_drivers.map((feat: { feature: string; shap_value: number; direction: 'positive' | 'negative' }, idx: number) => {
                                                                const maxContribution = Math.max(...explanation.top_drivers.map((f: { shap_value: number }) => Math.abs(f.shap_value)));
                                                                const percentage = maxContribution > 0 ? (Math.abs(feat.shap_value) / maxContribution) * 100 : 0;

                                                                return (
                                                                    <div key={feat.feature} className="flex items-center space-x-4 mb-4">
                                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${feat.direction === 'positive' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                                            {idx + 1}
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center justify-between mb-1">
                                                                                <span className="text-sm font-medium text-gray-700">{getFriendlyFeatureName(feat.feature)}</span>
                                                                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${feat.direction === 'positive' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                                    {feat.direction === 'positive' ? '↑ Boosted Score' : '↓ Lowered Score'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                                                                                <div
                                                                                    className={`h-2.5 rounded-full transition-all duration-500 ${feat.direction === 'positive' ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
                                                                                    style={{ width: `${percentage}%` }}
                                                                                ></div>
                                                                            </div>
                                                                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                                                                <span>Impact: {feat.shap_value > 0 ? '+' : ''}{feat.shap_value.toFixed(3)}</span>
                                                                                <span>{percentage.toFixed(0)}% of total impact</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* What This Means */}
                                                        <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                                            <h5 className="text-sm font-semibold text-blue-800 mb-2 flex items-center">
                                                                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                                </svg>
                                                                What This Means for the Student
                                                            </h5>
                                                            <ul className="text-sm text-blue-700 space-y-2">
                                                                {explanation.top_drivers
                                                                    .filter((f: { direction: string }) => f.direction === 'negative')
                                                                    .slice(0, 3)
                                                                    .map((feat: { feature: string; shap_value: number }, idx: number) => {
                                                                        const category = getFeatureCategory(feat.feature);
                                                                        const isAcademicHistory = category === 'Academic History';
                                                                        return (
                                                                            <li key={idx} className="flex items-start">
                                                                                <span className="mr-2">•</span>
                                                                                <span>
                                                                                    <strong>"{getFriendlyFeatureName(feat.feature)}"</strong> contributes a negative impact on the predicted score, make an investigation about this.
                                                                                    {isAcademicHistory && ' (Past grades cannot be changed, but indicate areas needing current support)'}
                                                                                </span>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                {explanation.top_drivers.filter((f: { direction: string }) => f.direction === 'negative').length === 0 && (
                                                                    <li className="flex items-start">
                                                                        <span className="mr-2">•</span>
                                                                        <span>Major factors are positively contributing to this student's predicted score. The student's historical performance shows strong academic foundations.</span>
                                                                    </li>
                                                                )}
                                                            </ul>
                                                            <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-blue-600">
                                                                <strong>Note:</strong> All features shown are from historical data (past grades) which cannot be changed. This analysis helps identify patterns and strengths, but current teaching and support are what can actually improve future outcomes.
                                                            </div>
                                                        </div>

                                                        {/* Base Score Info */}
                                                        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                                                            <span className="font-medium">Base Score:</span> {explanation.base_value?.toFixed(1) || 'N/A'} (the average prediction before considering specific factors)
                                                        </div>
                                                    </>
                                                );
                                            }
                                            return (
                                                <div className="text-center py-8 text-gray-500">
                                                    <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <p>Feature importance data not available for this student</p>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <p>Explanations not available</p>
                                        <p className="text-xs mt-1">Please re-run the analysis to generate feature explanations</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Back to Dashboard Button */}
            <div className="flex justify-center">
                <button
                    onClick={() => navigate('/dashboard')}
                    className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center space-x-2"
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>Analyze Different Dataset</span>
                </button>
            </div>
        </div >
    );
}