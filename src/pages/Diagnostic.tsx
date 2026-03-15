import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";

const Diagnostic = () => (
  <div className="min-h-screen bg-background flex items-center justify-center px-4">
    <div className="text-center max-w-sm">
      <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-6">
        <FileText className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">Simulado Diagnóstico</h1>
      <p className="text-muted-foreground mt-2">
        Em breve você poderá realizar simulados personalizados para identificar seus pontos fortes e fracos.
      </p>
      <Link
        to="/dashboard"
        className="mt-8 h-11 px-6 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-accent active:scale-[0.98] transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao Dashboard
      </Link>
    </div>
  </div>
);

export default Diagnostic;
