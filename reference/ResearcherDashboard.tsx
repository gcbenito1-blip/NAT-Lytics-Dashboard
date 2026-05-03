import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from '../components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../components/ui/tooltip';
import { Upload, BarChart3, LineChart, Target, School, Users, LogOut, Menu, UserCog, UserPlus, Shield, Download, Info, HelpCircle } from 'lucide-react';
import { ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

type TabType = 'metrics' | 'charts' | 'feature-importance' | 'school-comparison' | 'student-table' | 'user-management';

interface User {
  name: string;
  username: string;
  role: 'researcher' | 'teacher' | 'school_admin';
  status: 'Active' | 'Inactive';
  lastLogin: string;
}

export default function ResearcherDashboard() {
  const navigate = useNavigate();
  const { logout, mode, userName, setMode } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('metrics');
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: '' });
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);
  const [allMetrics, setAllMetrics] = useState<any[]>([]);
  const [featureImportance, setFeatureImportance] = useState<any[]>([]);
  const [proficiencyLabels, setProficiencyLabels] = useState<any[]>([]);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [predictions, setPredictions] = useState<any[]>([]);

  const [modelOutputs, setModelOutputs] = useState<any>(null);
  const [scatterPlotData, setScatterPlotData] = useState<any[]>([]);
  const [proficiencyDistribution, setProficiencyDistribution] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // School-level analytics state
  const [schoolMetrics, setSchoolMetrics] = useState<any[]>([]);
  const [schoolMAE, setSchoolMAE] = useState<any[]>([]);
  const [schoolProficiency, setSchoolProficiency] = useState<any[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);

  // Individual test results state
  const [testResults, setTestResults] = useState<any[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Filter state
  const [filters, setFilters] = useState({
    school: '',
    proficiency: '',
    diffMin: '',
    diffMax: '',
    errorMin: '',
    errorMax: '',
  });

  const [users, setUsers] = useState<User[]>(() => {
    const stored = localStorage.getItem('users');
    if (stored) {
      try {
        const loginUsers = JSON.parse(stored) as Record<string, { username: string; password: string; name: string; role: string }>;
        return Object.values(loginUsers).map((u) => ({
          name: u.name,
          username: u.username,
          role: u.role as 'researcher' | 'teacher' | 'school_admin',
          status: 'Active' as const,
          lastLogin: 'Never',
        }));
      } catch (e) {}
    }
    return [
      { name: 'Iris Oiga', username: 'Researcher_Iris', role: 'researcher', status: 'Active', lastLogin: '2026-04-23 07:30 AM' },
      { name: 'Charlyn Fernandez', username: 'Teacher_Charlyn', role: 'teacher', status: 'Active', lastLogin: '2026-04-22 03:15 PM' },
      { name: 'Daniel John Renti-Cruz', username: 'Admin_Niel', role: 'school_admin', status: 'Active', lastLogin: '2026-04-21 10:45 AM' },
    ];
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const metricsRes = await fetch('http://localhost:5000/metrics');
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json();
          setMetrics({
            mae: metricsData.MAE || metricsData.mae || 0,
            rmse: metricsData.RMSE || metricsData.rmse || 0,
            r2: metricsData.R2 || metricsData.r2 || 0,
          });
        }

        const allMetricsRes = await fetch('http://localhost:5000/all-metrics');
        if (allMetricsRes.ok) {
          const allMetricsData = await allMetricsRes.json();
          setAllMetrics(allMetricsData.models || []);
        }

        const fiRes = await fetch('http://localhost:5000/feature-importance');
        if (fiRes.ok) {
          const fiData = await fiRes.json();
          let fiArray: { feature: string; importance: number }[] = [];
          if (fiData.features && fiData.importances && fiData.sorted_indices) {
            fiArray = (fiData.sorted_indices as number[]).map((idx: number) => ({
              feature: fiData.features[idx],
              importance: parseFloat(fiData.importances[idx]) || 0,
            }));
          } else {
            fiArray = Object.entries(fiData)
              .filter(([key]) => !['features', 'importances', 'sorted_indices'].includes(key))
              .map(([feature, importance]) => ({
                feature: String(feature),
                importance: parseFloat(String(importance)) || 0,
              }))
              .sort((a, b) => b.importance - a.importance);
          }
          setFeatureImportance(fiArray);
        }

        const profRes = await fetch('http://localhost:5000/proficiency-labels');
        if (profRes.ok) {
          const profData = await profRes.json();
          setProficiencyLabels(profData.bands || []);
        }

        setSchoolLoading(true);
        try {
          const metricsRes = await fetch('http://localhost:5000/api/school-metrics');
          if (metricsRes.ok) {
            const metricsData = await metricsRes.json();
            setSchoolMetrics(metricsData.schools || []);
          }

          const maeRes = await fetch('http://localhost:5000/api/school-mae');
          if (maeRes.ok) {
            const maeData = await maeRes.json();
            setSchoolMAE(maeData.schools || []);
          }

          const profDistRes = await fetch('http://localhost:5000/api/school-proficiency');
          if (profDistRes.ok) {
            const profDistData = await profDistRes.json();
            const transformed = (profDistData.schools || []).map((s: any) => ({
              School: s.School,
              Actual_Not_Proficient: s.Actual["Not Proficient"] || 0,
              Actual_Low_Proficient: s.Actual["Low Proficient"] || 0,
              Actual_Nearly_Proficient: s.Actual["Nearly Proficient"] || 0,
              Actual_Proficient: s.Actual["Proficient"] || 0,
              Actual_Highly_Proficient: s.Actual["Highly Proficient"] || 0,
              Pred_Not_Proficient: s.Predicted["Not Proficient"] || 0,
              Pred_Low_Proficient: s.Predicted["Low Proficient"] || 0,
              Pred_Nearly_Proficient: s.Predicted["Nearly Proficient"] || 0,
              Pred_Proficient: s.Predicted["Proficient"] || 0,
              Pred_Highly_Proficient: s.Predicted["Highly Proficient"] || 0,
            }));
            setSchoolProficiency(transformed);
          }

          const testRes = await fetch('http://localhost:5000/api/test-results');
          if (testRes.ok) {
            const testData = await testRes.json();
            const transformed = (testData.results || []).map((r: any) => ({
              id: r.learnerID,
              school: r.School,
              actualMPS: r.Actual_MPS,
              predictedMPS: r.Predicted_MPS,
              difference: r.Difference,
              proficiency: r.Proficiency,
              errorMagnitude: r.Error_Magnitude,
            }));
            setTestResults(transformed);
          }
        } catch (err) {
          console.error('Failed to fetch school data:', err);
        } finally {
          setSchoolLoading(false);
        }

        const modelRes = await fetch('http://localhost:5000/model-predict');
        if (modelRes.ok) {
          const modelData = await modelRes.json();
          setModelOutputs(modelData);

          const bestModelKey = Object.keys(modelData).reduce((best, key) => {
            const current = modelData[key];
            const bestModel = modelData[best];
            if (!current || !current.y_true || !current.y_pred) return best;
            if (!bestModel || !bestModel.y_true || !bestModel.y_pred) return key;

            const yTrue = current.y_true;
            const yPred = current.y_pred;
            const meanY = yTrue.reduce((a: number, b: number) => a + b, 0) / yTrue.length;
            const ssRes = yTrue.reduce((sum: number, val: number, i: number) => sum + Math.pow(val - yPred[i], 2), 0);
            const ssTot = yTrue.reduce((sum: number, val: number) => sum + Math.pow(val - meanY, 2), 0);
            const r2 = 1 - ssRes / ssTot;

            const bestYTrue = bestModel.y_true;
            const bestYPred = bestModel.y_pred;
            const bestMeanY = bestYTrue.reduce((a: number, b: number) => a + b, 0) / bestYTrue.length;
            const bestSsRes = bestYTrue.reduce((sum: number, val: number, i: number) => sum + Math.pow(val - bestYPred[i], 2), 0);
            const bestSsTot = bestYTrue.reduce((sum: number, val: number) => sum + Math.pow(val - bestMeanY, 2), 0);
            const bestR2 = 1 - bestSsRes / bestSsTot;

            return r2 > bestR2 ? key : best;
          }, Object.keys(modelData)[0] || 'randomForest');

          const bestModel = modelData[bestModelKey];
          const yTrue = bestModel?.y_true || [];
          const yPred = bestModel?.y_pred || [];
          setSelectedModel(bestModelKey);

          const scatterData = yTrue.map((actual: number, i: number) => ({
            actual: Math.round(actual * 10) / 10,
            predicted: Math.round((yPred[i] || 0) * 10) / 10
          }));
          setScatterPlotData(scatterData);

          const proficiencyBands = [
            { code: 0, label: 'Not Proficient', min: 0, max: 24 },
            { code: 1, label: 'Low Proficient', min: 25, max: 49 },
            { code: 2, label: 'Nearly Proficient', min: 50, max: 74 },
            { code: 3, label: 'Proficient', min: 75, max: 89 },
            { code: 4, label: 'Highly Proficient', min: 90, max: 100 }
          ];

          const getBandCode = (score: number) => {
            for (const band of proficiencyBands) {
              if (score >= band.min && score <= band.max) return band.code;
            }
            return 0;
          };

          const actualCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
          const predictedCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

          yTrue.forEach((score: number) => { actualCounts[getBandCode(score)]++; });
          yPred.forEach((score: number) => { predictedCounts[getBandCode(score)]++; });

          setProficiencyDistribution(proficiencyBands.map(band => ({
            proficiency: band.label,
            actual: actualCounts[band.code] || 0,
            predicted: predictedCounts[band.code] || 0
          })));
        }
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleAddUser = () => {
    if (newUser.name && newUser.username && newUser.password && newUser.role) {
      const getLoginUsers = () => {
        const stored = localStorage.getItem('users');
        if (!stored) return {};
        try { return JSON.parse(stored) as Record<string, any>; } catch { return {}; }
      };
      const loginUsers = getLoginUsers();
      loginUsers[newUser.username] = {
        username: newUser.username,
        password: newUser.password,
        name: newUser.name,
        role: newUser.role,
      };
      localStorage.setItem('users', JSON.stringify(loginUsers));

      const user: User = {
        name: newUser.name,
        username: newUser.username,
        role: newUser.role as 'researcher' | 'teacher' | 'school_admin',
        status: 'Active',
        lastLogin: 'Never',
      };
      setUsers([...users, user]);
      setNewUser({ name: '', username: '', password: '', role: '' });
      setShowAddUserDialog(false);
    }
  };

  const handleModelChange = (modelKey: string) => {
    setSelectedModel(modelKey);
    const model = modelOutputs[modelKey];
    if (model && model.y_true && model.y_pred) {
      const yTrue = model.y_true;
      const yPred = model.y_pred;

      setScatterPlotData(yTrue.map((actual: number, i: number) => ({
        actual: Math.round(actual * 10) / 10,
        predicted: Math.round((yPred[i] || 0) * 10) / 10
      })));

      const proficiencyBands = [
        { code: 0, label: 'Not Proficient', min: 0, max: 24 },
        { code: 1, label: 'Low Proficient', min: 25, max: 49 },
        { code: 2, label: 'Nearly Proficient', min: 50, max: 74 },
        { code: 3, label: 'Proficient', min: 75, max: 89 },
        { code: 4, label: 'Highly Proficient', min: 90, max: 100 }
      ];
      const getBandCode = (score: number) => {
        for (const band of proficiencyBands) {
          if (score >= band.min && score <= band.max) return band.code;
        }
        return 0;
      };
      const actualCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
      const predictedCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
      yTrue.forEach((score: number) => { actualCounts[getBandCode(score)]++; });
      yPred.forEach((score: number) => { predictedCounts[getBandCode(score)]++; });
      setProficiencyDistribution(proficiencyBands.map(band => ({
        proficiency: band.label,
        actual: actualCounts[band.code] || 0,
        predicted: predictedCounts[band.code] || 0
      })));
    }
  };

  const downloadStudentTableCSV = () => {
    if (testResults.length === 0) return;
    const headers = ['learnerID', 'School', 'Actual_MPS', 'Predicted_MPS', 'Difference', 'Proficiency', 'Error_Magnitude'];
    const csvRows = [headers.join(',')];
    for (const row of testResults) {
      csvRows.push([
        `"${row.id}"`, `"${row.school}"`,
        row.actualMPS.toFixed(4), row.predictedMPS.toFixed(4),
        row.difference.toFixed(4), `"${row.proficiency}"`,
        row.errorMagnitude.toFixed(4),
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_predictions.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const uniqueSchools = Array.from(new Set(testResults.map(r => r.school))).sort();

  const filteredResults = testResults.filter((student) => {
    if (filters.school && student.school !== filters.school) return false;
    if (filters.proficiency && student.proficiency !== filters.proficiency) return false;
    if (filters.diffMin && student.difference < parseFloat(filters.diffMin)) return false;
    if (filters.diffMax && student.difference > parseFloat(filters.diffMax)) return false;
    if (filters.errorMin && student.errorMagnitude < parseFloat(filters.errorMin)) return false;
    if (filters.errorMax && student.errorMagnitude > parseFloat(filters.errorMax)) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredResults.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedResults = filteredResults.slice(startIndex, startIndex + rowsPerPage);

  useEffect(() => { setCurrentPage(1); }, [filters]);

  const userCounts = {
    total: users.length,
    researchers: users.filter(u => u.role === 'researcher').length,
    teachers: users.filter(u => u.role === 'teacher').length,
    admins: users.filter(u => u.role === 'school_admin').length,
  };

  const menuItems = [
    { id: 'metrics' as const, label: 'Model Metrics', icon: Target },
    { id: 'charts' as const, label: 'Charts', icon: BarChart3 },
    { id: 'feature-importance' as const, label: 'Feature Importance', icon: LineChart },
    { id: 'school-comparison' as const, label: 'School Comparison', icon: School },
    { id: 'student-table' as const, label: 'Student Table', icon: Users },
  ];

  const modelMetrics = metrics ? {
    mae: metrics.mae.toFixed(4),
    rmse: metrics.rmse.toFixed(4),
    r2: metrics.r2.toFixed(4),
  } : { mae: 'N/A', rmse: 'N/A', r2: 'N/A' };

  const algorithmComparison = allMetrics.length > 0 ? allMetrics.map((model: any, index: number) => {
    const r2Value = parseFloat(model.R2 || model.r2 || 0);
    const maxR2 = Math.max(...allMetrics.map((m: any) => parseFloat(m.R2 || m.r2 || 0)));
    let status;
    if (r2Value === 1) status = 'Perfect';
    else if (r2Value === maxR2 && allMetrics.filter((m: any) => parseFloat(m.R2 || m.r2 || 0) === maxR2).length === 1) status = 'Best Fit';
    else if (r2Value > 0) status = 'Good';
    else if (r2Value === 0) status = 'Baseline';
    else status = 'Needs Improvement';
    return {
      algorithm: model.model || model.model_name || `Model ${index + 1}`,
      mae: (parseFloat(model.MAE || model.mae || 0)).toFixed(4),
      rmse: (parseFloat(model.RMSE || model.rmse || 0)).toFixed(4),
      r2: (parseFloat(model.R2 || model.r2 || 0)).toFixed(4),
      status,
    };
  }) : [];

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-lg font-bold text-sky-600 px-4 py-3">
                <Link to="/landing" className="hover:underline focus:outline-none">NAT-Lytics</Link>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="px-4 py-2 space-y-1">
                  <p className="text-xs text-gray-700 font-semibold">{userName}</p>
                  <p className="text-xs text-gray-500">Researcher</p>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Mode</SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="px-4 py-2">
                  <Tabs value={mode || 'evaluation'} onValueChange={(value) => setMode(value as 'evaluation' | 'prediction')} className="w-full">
                    <TabsList className="w-full">
                      <TabsTrigger value="evaluation" className="flex-1">Evaluation</TabsTrigger>
                      <TabsTrigger value="prediction" className="flex-1">Prediction</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Evaluation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          onClick={() => setActiveTab(item.id)}
                          isActive={activeTab === item.id}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setActiveTab('user-management')}
                      isActive={activeTab === 'user-management'}
                    >
                      <UserCog className="h-4 w-4" />
                      <span>User Management</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleLogout}>
                      <LogOut className="h-4 w-4" />
                      <span>Logout</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <main className="flex-1 p-6 bg-gray-50">
          <div className="mb-6 flex items-center gap-4">
            <SidebarTrigger>
              <Button variant="outline" size="icon">
                <Menu className="h-4 w-4" />
              </Button>
            </SidebarTrigger>
            <h1 className="text-3xl font-bold text-gray-800">Researcher Dashboard</h1>
          </div>

          {activeTab === 'metrics' && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-gray-600">MAE</CardTitle>
                    <CardDescription>Mean Absolute Error</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-sky-600">{modelMetrics.mae}</p>
                    <p className="text-xs text-gray-500 mt-1">Lower is better</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-gray-600">RMSE</CardTitle>
                    <CardDescription>Root Mean Squared Error</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-sky-600">{modelMetrics.rmse}</p>
                    <p className="text-xs text-gray-500 mt-1">Lower is better</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-gray-600">R²</CardTitle>
                    <CardDescription>Coefficient of Determination</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-sky-600">{modelMetrics.r2}</p>
                    <p className="text-xs text-gray-500 mt-1">Higher is better (0-1)</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Algorithm Comparison</CardTitle>
                  <CardDescription>Performance comparison across different ML algorithms</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead><b>Algorithm</b></TableHead>
                        <TableHead><b>MAE</b></TableHead>
                        <TableHead><b>RMSE</b></TableHead>
                        <TableHead><b>R²</b></TableHead>
                        <TableHead><b>Status</b></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {algorithmComparison.map((algo) => (
                        <TableRow key={algo.algorithm}>
                          <TableCell className="font-medium">{algo.algorithm}</TableCell>
                          <TableCell>{algo.mae}</TableCell>
                          <TableCell>{algo.rmse}</TableCell>
                          <TableCell>{algo.r2}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              algo.status === 'Perfect' ? 'bg-purple-100 text-purple-800' :
                              algo.status === 'Best Fit' ? 'bg-green-100 text-green-800' :
                              algo.status === 'Good' ? 'bg-blue-100 text-blue-800' :
                              algo.status === 'Baseline' ? 'bg-gray-100 text-gray-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {algo.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'charts' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Model Selection</CardTitle>
                  <CardDescription>Choose which model to display in the charts below</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Label htmlFor="model-select" className="text-sm font-medium">Select Model:</Label>
                    <Select value={selectedModel} onValueChange={handleModelChange}>
                      <SelectTrigger id="model-select" className="w-[300px]">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(modelOutputs || {}).map((key) => (
                          <SelectItem key={key} value={key}>
                            {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-gray-500">
                      {selectedModel && allMetrics.find((m: any) => (m.model || m.model_name) === selectedModel) && (
                        <>R²: {(allMetrics.find((m: any) => (m.model || m.model_name) === selectedModel)?.R2 || allMetrics.find((m: any) => (m.model || m.model_name) === selectedModel)?.r2 || 0).toFixed(3)}</>
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Actual vs. Predicted Scatter Plot</CardTitle>
                  <CardDescription>Comparison of actual NAT scores against predicted scores</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={640}>
                    <ScatterChart margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="actual" name="Actual MPS"
                        label={{ value: 'Actual MPS', position: 'insideBottom', offset: -20 }}
                        domain={[30, 100]} tickCount={8} />
                      <YAxis type="number" dataKey="predicted" name="Predicted MPS"
                        label={{ value: 'Predicted MPS', angle: -90, position: 'insideLeft' }}
                        domain={[30, 100]} tickCount={8} />
                      <RechartsTooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                <p className="text-sm font-medium">{`Actual: ${payload[0].payload.actual}`}</p>
                                <p className="text-sm font-medium">{`Predicted: ${payload[0].payload.predicted}`}</p>
                                <p className="text-sm text-gray-500">{`Error: ${(Math.abs(payload[0].payload.actual - payload[0].payload.predicted)).toFixed(1)}`}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px', paddingBottom: '10px' }} />
                      <Scatter name="Actual vs Predicted" data={scatterPlotData} fill="#3685e0" isAnimationActive={true} />
                      <Scatter name="Perfect Prediction Line"
                        data={[{ actual: 30, predicted: 30 }, { actual: 100, predicted: 100 }]}
                        fill="#ef4444" line stroke="#ef4444" shape="circle" isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Proficiency Distribution</CardTitle>
                  <CardDescription>Actual vs. predicted proficiency level distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={640}>
                    <BarChart data={proficiencyDistribution} margin={{ top: 40, right: 40, left: 20, bottom: 80 }} barGap={0} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="proficiency" angle={-45} textAnchor="end" height={100} fontSize={12} />
                      <YAxis label={{ value: 'Number of Students', angle: -90, position: 'insideLeft' }}
                        domain={[0, 'dataMax + 5']} tickCount={6} />
                      <Legend wrapperStyle={{ paddingTop: '20px', paddingBottom: '10px' }} iconType="rect" iconSize={14} />
                      <Bar dataKey="actual" fill="#3b82f6" name="Actual" radius={[4, 4, 0, 0]} isAnimationActive={true} />
                      <Bar dataKey="predicted" fill="#ef4444" name="Predicted" radius={[4, 4, 0, 0]} isAnimationActive={true} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'feature-importance' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Feature Importance Analysis</CardTitle>
                  <CardDescription>
                    All {featureImportance.length} features ranked by their contribution to NAT score predictions (sorted descending)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {featureImportance.length === 0 ? (
                    <div className="h-96 flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-gray-500">Feature importance visualization will appear here</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={featureImportance.length * 36 + 80}>
                      <BarChart
                        layout="vertical"
                        data={[...featureImportance].sort((a, b) => b.importance - a.importance)}
                        margin={{ top: 10, right: 80, left: 220, bottom: 30 }}
                        barCategoryGap="20%"
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number"
                          domain={[0, (dataMax: number) => Math.ceil(dataMax * 10 + 3) / 10]}
                          tickCount={6} tickFormatter={(v) => v.toFixed(2)}
                          label={{ value: 'Importance Score', position: 'insideBottom', offset: -15 }}
                          tick={{ fontSize: 12 }} />
                        <YAxis type="category" dataKey="feature" width={210}
                          tick={{ fontSize: 11, fill: '#374151' }} tickLine={false} />
                        <RechartsTooltip
                          formatter={(value: number) => [value.toFixed(4), 'Importance']}
                          contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                        <Bar dataKey="importance" name="Importance" radius={[0, 4, 4, 0]} isAnimationActive={true}
                          label={{ position: 'right', formatter: (v: number) => v.toFixed(3), fontSize: 11, fill: '#374151' }}>
                          {[...featureImportance].sort((a, b) => b.importance - a.importance).map((_entry, index, arr) => {
                            const ratio = 1 - index / Math.max(arr.length - 1, 1);
                            const r = Math.round(59 + (186 - 59) * (1 - ratio));
                            const g = Math.round(130 + (230 - 130) * (1 - ratio));
                            return <Cell key={`cell-${index}`} fill={`rgb(${r},${g},246)`} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {featureImportance.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Top 5 Most Important Features</CardTitle>
                    <CardDescription>Features with the highest predictive contribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[...featureImportance].sort((a, b) => b.importance - a.importance).slice(0, 5).map((item, index) => {
                        const maxImportance = Math.max(...featureImportance.map(f => f.importance));
                        return (
                          <div key={item.feature} className="flex items-center gap-4">
                            <div className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-semibold text-sm text-gray-800">{item.feature}</p>
                                <span className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                  {item.importance.toFixed(4)}
                                </span>
                              </div>
                              <div className="bg-sky-100 rounded-full h-2.5">
                                <div className="bg-sky-600 h-2.5 rounded-full transition-all duration-700"
                                  style={{ width: `${(item.importance / maxImportance) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'school-comparison' && (
            <div className="space-y-6">
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-900 flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    Research Purpose
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-blue-900 space-y-2">
                  <p className="font-semibold">Research Question:</p>
                  <p>Does the model perform consistently across all 8 schools, or does it predict better for some schools than others?</p>
                  <div className="mt-3">
                    <p className="font-semibold">Implications for Thesis Documentation:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                      <li><span className="font-medium">Model Fairness:</span> Identifies if the model predicts better for large schools vs. small schools, or mainstream vs. SPED Center</li>
                      <li><span className="font-medium">Generalizability:</span> Documents whether the model is robust across diverse school contexts with varying enrollment</li>
                      <li><span className="font-medium">Chapter 4 Figure:</span> Provides Figure 4.X for Objective 3 results showing prediction distribution across 8 schools</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Model Performance by School</CardTitle>
                  <CardDescription>Mean Absolute Error (MAE) across 8 participating schools in Urdaneta City</CardDescription>
                </CardHeader>
                <CardContent>
                  {schoolLoading ? (
                    <div className="h-96 flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-gray-500">Loading school performance data...</p>
                    </div>
                  ) : schoolMAE.length > 0 ? (
                    <ResponsiveContainer width="100%" height={800}>
                      <BarChart data={schoolMAE} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="School" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 10 }} />
                        <YAxis label={{ value: 'MAE (Lower is Better)', angle: -90, position: 'outsideCenter', dx: -20 }} domain={[0, 'dataMax + 2']} />
                        <RechartsTooltip formatter={(value: number) => [value.toFixed(4), 'MAE']} contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="MAE" radius={[4, 4, 0, 0]}>
                          {schoolMAE.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.MAE > 6 ? '#ef4444' : entry.MAE > 5.5 ? '#195b81' : '#3da6e2'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-96 flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-gray-500">No school MAE data available</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2 text-center">Note: Red bars indicate higher prediction error</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Proficiency Distribution by School</CardTitle>
                  <CardDescription>Predicted proficiency levels across all 8 schools (Actual vs. Predicted comparison)</CardDescription>
                </CardHeader>
                <CardContent>
                  {schoolLoading ? (
                    <div className="h-96 flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-gray-500">Loading proficiency data...</p>
                    </div>
                  ) : schoolProficiency.length > 0 ? (
                    <ResponsiveContainer width="100%" height={800}>
                      <BarChart data={schoolProficiency} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="School" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 10 }} />
                        <YAxis label={{ value: 'Percentage of Students', angle: -90, position: 'outsideCenter', dx: -20 }} domain={[0, 100]} />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const nonZeroItems = payload.filter((entry: any) => entry.value !== 0);
                              if (nonZeroItems.length === 0) return null;
                              return (
                                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                  {nonZeroItems.map((entry: any, index: number) => (
                                    <p key={index} className="text-sm" style={{ color: entry.color }}>
                                      {`${entry.name}: ${entry.value.toFixed(1)}%`}
                                    </p>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="Actual_Not_Proficient" stackId="a" fill="#F3C66C" name="Not Proficient" />
                        <Bar dataKey="Actual_Low_Proficient" stackId="a" fill="#DB6B78" name="Low Proficient" />
                        <Bar dataKey="Actual_Nearly_Proficient" stackId="a" fill="#339CA7" name="Nearly Proficient" />
                        <Bar dataKey="Actual_Proficient" stackId="a" fill="#5A83B0" name="Proficient" />
                        <Bar dataKey="Actual_Highly_Proficient" stackId="a" fill="#2A5576" name="Highly Proficient" />
                        <Bar dataKey="Pred_Not_Proficient" stackId="b" fill="#B77F2E" name="Not Proficient (Pred)" />
                        <Bar dataKey="Pred_Low_Proficient" stackId="b" fill="#8F2D3A" name="Low Proficient (Pred)" />
                        <Bar dataKey="Pred_Nearly_Proficient" stackId="b" fill="#00575F" name="Nearly Proficient (Pred)" />
                        <Bar dataKey="Pred_Proficient" stackId="b" fill="#214664" name="Proficient (Pred)" />
                        <Bar dataKey="Pred_Highly_Proficient" stackId="b" fill="#00283A" name="Highly Proficient (Pred)" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-96 flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-gray-500">No proficiency distribution data available</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Stacked bars show actual (left stack) vs predicted (right stack) proficiency percentages per school
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>School Summary Statistics</CardTitle>
                  <CardDescription>Student count and average MPS (Actual vs. Predicted) for each school</CardDescription>
                </CardHeader>
                <CardContent>
                  {schoolMetrics.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>School</TableHead>
                          <TableHead>Students</TableHead>
                          <TableHead>Avg Actual MPS</TableHead>
                          <TableHead>Avg Predicted MPS</TableHead>
                          <TableHead>Bias</TableHead>
                          <TableHead>MAE</TableHead>
                          <TableHead>Not Prof (%)</TableHead>
                          <TableHead>Low (%)</TableHead>
                          <TableHead>Nearly (%)</TableHead>
                          <TableHead>Prof (%)</TableHead>
                          <TableHead>High (%)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schoolMetrics.map((school) => (
                          <TableRow key={school.School}>
                            <TableCell className="font-medium max-w-xs truncate" title={school.School}>{school.School}</TableCell>
                            <TableCell>{school.Student_Count}</TableCell>
                            <TableCell>{school.Avg_Actual_MPS.toFixed(2)}</TableCell>
                            <TableCell>{school.Avg_Predicted_MPS.toFixed(2)}</TableCell>
                            <TableCell className={school.Avg_Bias >= 0 ? 'text-blue-600' : 'text-red-600'}>
                              {school.Avg_Bias >= 0 ? '+' : ''}{school.Avg_Bias.toFixed(2)}
                            </TableCell>
                            <TableCell>{school.MAE.toFixed(4)}</TableCell>
                            <TableCell>{(school["Actual_Not Proficient"] || 0).toFixed(1)}%</TableCell>
                            <TableCell>{(school["Actual_Low Proficient"] || 0).toFixed(1)}%</TableCell>
                            <TableCell>{(school["Actual_Nearly Proficient"] || 0).toFixed(1)}%</TableCell>
                            <TableCell>{(school["Actual_Proficient"] || 0).toFixed(1)}%</TableCell>
                            <TableCell>{(school["Actual_Highly Proficient"] || 0).toFixed(1)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="h-32 flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-gray-500">No school metrics available</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-amber-50 border-amber-200">
                <CardHeader>
                  <CardTitle className="text-amber-900">Key Findings for Chapter 4 & 5</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-amber-900 space-y-2">
                  <p><span className="font-semibold">Fairness Assessment:</span> Check MAE values per school to identify if the model performs consistently. Higher MAE indicates lower prediction accuracy for that school.</p>
                  <p><span className="font-semibold">Proficiency Patterns:</span> Compare Actual vs Predicted proficiency distributions to see where the model over/under-predicts certain performance levels.</p>
                  <p><span className="font-semibold">Generalizability:</span> Consistent MAE across all 8 schools (ideally below 6.0) supports the model's robustness across diverse school contexts in Urdaneta City.</p>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'student-table' && (
            <div className="space-y-6">
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-900 flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    Research Purpose
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-blue-900 space-y-2">
                  <p className="font-semibold">Purpose of Individual-Level Prediction Table:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><span className="font-medium">Prediction Accuracy Record:</span> Documents actual vs. predicted MPS for each learner</li>
                    <li><span className="font-medium">Outlier Investigation:</span> Identifies large prediction errors for case-level investigation</li>
                    <li><span className="font-medium">Downloadable Research Record:</span> Enables offline analysis in Python/Excel</li>
                  </ul>
                  <p className="mt-2 text-xs font-semibold">Note: For research validation, not for identifying which specific students need remediation.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Individual Learner Predictions</CardTitle>
                      <CardDescription>Actual vs. Predicted NAT MPS with error analysis ({filteredResults.length} records)</CardDescription>
                    </div>
                    <Button onClick={downloadStudentTableCSV} variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Filters */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      {/* School Filter — FIX: use sentinel "__all__" instead of "" */}
                      <div>
                        <Label htmlFor="school-filter">School</Label>
                        <Select
                          value={filters.school || '__all__'}
                          onValueChange={(v) => setFilters({ ...filters, school: v === '__all__' ? '' : v })}
                        >
                          <SelectTrigger id="school-filter">
                            <SelectValue placeholder="All Schools" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All Schools</SelectItem>
                            {uniqueSchools.map((school) => (
                              <SelectItem key={school} value={school}>{school}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Proficiency Filter — FIX: same sentinel pattern */}
                      <div>
                        <Label htmlFor="prof-filter">Proficiency</Label>
                        <Select
                          value={filters.proficiency || '__all__'}
                          onValueChange={(v) => setFilters({ ...filters, proficiency: v === '__all__' ? '' : v })}
                        >
                          <SelectTrigger id="prof-filter">
                            <SelectValue placeholder="All Levels" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All Levels</SelectItem>
                            <SelectItem value="Highly Proficient">Highly Proficient</SelectItem>
                            <SelectItem value="Proficient">Proficient</SelectItem>
                            <SelectItem value="Nearly Proficient">Nearly Proficient</SelectItem>
                            <SelectItem value="Low Proficient">Low Proficient</SelectItem>
                            <SelectItem value="Not Proficient">Not Proficient</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="diff-min">Diff Min (≥)</Label>
                        <Input id="diff-min" type="number" placeholder="e.g., -10"
                          value={filters.diffMin} onChange={(e) => setFilters({ ...filters, diffMin: e.target.value })} />
                      </div>

                      <div>
                        <Label htmlFor="diff-max">Diff Max (≤)</Label>
                        <Input id="diff-max" type="number" placeholder="e.g., 10"
                          value={filters.diffMax} onChange={(e) => setFilters({ ...filters, diffMax: e.target.value })} />
                      </div>

                      <div>
                        <Label htmlFor="error-min">Error Min (≥)</Label>
                        <Input id="error-min" type="number" placeholder="e.g., 0"
                          value={filters.errorMin} onChange={(e) => setFilters({ ...filters, errorMin: e.target.value })} />
                      </div>

                      <div>
                        <Label htmlFor="error-max">Error Max (≤)</Label>
                        <Input id="error-max" type="number" placeholder="e.g., 5"
                          value={filters.errorMax} onChange={(e) => setFilters({ ...filters, errorMax: e.target.value })} />
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setFilters({
                        school: '', proficiency: '', diffMin: '', diffMax: '', errorMin: '', errorMax: ''
                      })}>
                        Clear Filters
                      </Button>
                      <span className="text-sm text-gray-600 self-center ml-2">
                        Showing {paginatedResults.length} of {filteredResults.length} records (Total: {testResults.length})
                      </span>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Learner ID</TableHead>
                        <TableHead>School</TableHead>
                        <TableHead>Actual MPS</TableHead>
                        <TableHead>Predicted MPS</TableHead>
                        <TableHead>Difference</TableHead>
                        <TableHead>Proficiency</TableHead>
                        <TableHead>Error Magnitude</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedResults.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.id}</TableCell>
                          <TableCell className="text-sm">{student.school}</TableCell>
                          <TableCell>{student.actualMPS.toFixed(1)}</TableCell>
                          <TableCell>{student.predictedMPS.toFixed(1)}</TableCell>
                          <TableCell className={Math.abs(student.difference) > 3 ? 'font-semibold text-red-600' : ''}>
                            {student.difference > 0 ? '+' : ''}{student.difference.toFixed(1)}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              student.proficiency === 'Highly Proficient' ? 'bg-green-100 text-green-800' :
                              student.proficiency === 'Proficient' ? 'bg-blue-100 text-blue-800' :
                              student.proficiency === 'Nearly Proficient' ? 'bg-yellow-100 text-yellow-800' :
                              student.proficiency === 'Low Proficient' ? 'bg-orange-100 text-orange-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {student.proficiency}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              Math.abs(student.difference) < 2 ? 'bg-green-100 text-green-800' :
                              Math.abs(student.difference) < 3 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {Math.abs(student.difference) < 2 ? 'Low' : Math.abs(student.difference) < 3 ? 'Medium' : 'High'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>First</Button>
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
                        <Input type="number" min={1} max={totalPages} value={currentPage}
                          onChange={(e) => { const val = parseInt(e.target.value); if (val >= 1 && val <= totalPages) setCurrentPage(val); }}
                          className="w-16 text-center" />
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>Last</Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <Label htmlFor="rows-per-page">Rows per page:</Label>
                        <Select value={rowsPerPage.toString()} onValueChange={(v) => { setRowsPerPage(parseInt(v)); setCurrentPage(1); }}>
                          <SelectTrigger id="rows-per-page" className="w-20"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 text-xs text-gray-600 space-y-1">
                    <p><span className="font-semibold">Difference Interpretation:</span> Positive = model underestimated; negative = overestimation</p>
                    <p><span className="font-semibold">Error Magnitude:</span> Red cells (|difference| &gt; 3) indicate cases worth investigating</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-amber-50 border-amber-200">
                <CardHeader>
                  <CardTitle className="text-amber-900">Error Analysis Summary</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-amber-900">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <p className="font-semibold">High Error Cases (|diff| &gt; 3):</p>
                      <p className="text-2xl font-bold text-red-600">
                        {filteredResults.filter(s => Math.abs(s.difference) > 3).length}
                      </p>
                      <p className="text-xs">Requires case-level investigation</p>
                    </div>
                    <div>
                      <p className="font-semibold">Medium Error Cases (2-3):</p>
                      <p className="text-2xl font-bold text-yellow-600">
                        {filteredResults.filter(s => Math.abs(s.difference) >= 2 && Math.abs(s.difference) <= 3).length}
                      </p>
                      <p className="text-xs">Acceptable prediction range</p>
                    </div>
                    <div>
                      <p className="font-semibold">Low Error Cases (&lt; 2):</p>
                      <p className="text-2xl font-bold text-green-600">
                        {filteredResults.filter(s => Math.abs(s.difference) < 2).length}
                      </p>
                      <p className="text-xs">High accuracy predictions</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs">
                    <span className="font-semibold">For Chapter 4 Discussion:</span> Focus on high-error cases to identify learner characteristics where the model struggles.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'user-management' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">User Management</h2>
                  <p className="text-sm text-gray-600">Manage system users and access permissions</p>
                </div>
                <Button onClick={() => setShowAddUserDialog(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add New User
                </Button>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Accounts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-sky-600">{userCounts.total}</p>
                    <p className="text-xs text-gray-500 mt-1">registered users</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Researchers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-purple-600">{userCounts.researchers}</p>
                    <p className="text-xs text-gray-500 mt-1">active researchers</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Teachers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-blue-600">{userCounts.teachers}</p>
                    <p className="text-xs text-gray-500 mt-1">active teachers</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">School Admins</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-sky-600">{userCounts.admins}</p>
                    <p className="text-xs text-gray-500 mt-1">active admins</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>System Users</CardTitle>
                  <CardDescription>List of all registered users in the NAT-Lytics system</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell>{user.username}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              user.role === 'researcher' ? 'bg-purple-100 text-purple-800' :
                              user.role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                              'bg-indigo-100 text-sky-800'
                            }`}>
                              {user.role === 'researcher' ? 'Researcher' : user.role === 'teacher' ? 'Teacher' : 'School Admin'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              user.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.status}
                            </span>
                          </TableCell>
                          <TableCell>{user.lastLogin}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm">Edit</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new user account for the NAT-Lytics system</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="Enter full name" value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" placeholder="Enter username" value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Enter password" value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={newUser.role || '__none__'} onValueChange={(value) => setNewUser({ ...newUser, role: value === '__none__' ? '' : value })}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="researcher">Researcher</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="school_admin">School Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddUserDialog(false)}>Cancel</Button>
            <Button onClick={handleAddUser}>Add User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
