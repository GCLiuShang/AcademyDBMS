import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { BreadcrumbProvider } from './components/Breadcrumb/BreadcrumbContext';
import Login from './pages/Login/Login';
import StudentDashboard from './pages/Dashboard/StudentDashboard';
import ProfessorDashboard from './pages/Dashboard/ProfessorDashboard';
import DepmAdmDashboard from './pages/Dashboard/DepmAdmDashboard';
import UnivAdmDashboard from './pages/Dashboard/UnivAdmDashboard';
import Receivebox from './pages/Receivebox/Receivebox';
import Sendbox from './pages/Sendbox/Sendbox';
import Rubbishbox from './pages/Rubbishbox/Rubbishbox';
import EditMessage from './pages/EditMessage/EditMessage';
import Accountsettings from './pages/Accountsettings/Accountsettings';
import Curricularapply from './pages/Curricularapply/Curricularapply';
import Curricularapprove from './pages/Curricularapprove/Curricularapprove';
import Courseapply from './pages/Courseapply/Courseapply';
import Gradeinput from './pages/Gradeinput/Gradeinput';
import Examapply from './pages/Examapply/Examapply';
import Arrange from './pages/Arrange/Arrange';
import Courseajust from './pages/Courseajust/Courseajust';
import Useradd from './pages/Useradd/Useradd';
import Examarrange from './pages/Examarrange/Examarrange';
import Enroll from './pages/Enroll/Enroll';
import Control from './pages/Control/Control';
import TrainingprogramEdit from './pages/TrainingprogramEdit/TrainingprogramEdit';
import AIChat from './components/AIChat/AIChat';
import { AIChatProvider } from './components/AIChat/AIChatContext';

function App() {
  return (
    <BreadcrumbProvider>
      <Router>
        <AIChatProvider>
          <AIChat />
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/student/dashboard" element={<StudentDashboard />} />
            <Route path="/professor/dashboard" element={<ProfessorDashboard />} />
            <Route path="/dept/dashboard" element={<DepmAdmDashboard />} />
            <Route path="/admin/dashboard" element={<UnivAdmDashboard />} />
            
            <Route path="/receivebox" element={<Receivebox />} />
            <Route path="/sendbox" element={<Sendbox />} />
            <Route path="/rubbishbox" element={<Rubbishbox />} />
            <Route path="/editmessage" element={<EditMessage />} />
            <Route path="/accountsettings" element={<Accountsettings />} />
            <Route path="/curricularapply" element={<Curricularapply />} />
            <Route path="/curricularapprove" element={<Curricularapprove />} />
            <Route path="/courseapply" element={<Courseapply />} />
            <Route path="/gradeinput" element={<Gradeinput />} />
            <Route path="/examapply" element={<Examapply />} />
            <Route path="/arrange" element={<Arrange />} />
            <Route path="/courseajust" element={<Courseajust />} />
            <Route path="/useradd" element={<Useradd />} />
            <Route path="/examarrange" element={<Examarrange />} />
            <Route path="/enroll" element={<Enroll />} />
            <Route path="/control" element={<Control />} />
            <Route path="/trainingprogramedit" element={<TrainingprogramEdit />} />

            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </AIChatProvider>
      </Router>
    </BreadcrumbProvider>
  );
}

export default App;
