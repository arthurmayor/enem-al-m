import { getSubjectBgClass } from "@/lib/subjectColors";

interface SubjectBadgeProps {
  subject: string;
}

const SubjectBadge = ({ subject }: SubjectBadgeProps) => {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSubjectBgClass(subject)}`}
    >
      {subject}
    </span>
  );
};

export default SubjectBadge;
