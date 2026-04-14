/**
 * HR Policy Violations & Penalties Catalog (GP HR Procedures & Policy 3.0)
 * Extracted from GPHRProcedures&Policy3.0-02.01.26.pdf
 * Used by CAP 0 Coaching (Violation Tracker) form
 */
const HR_VIOLATIONS = [
  {
    category: "1. Workplace Conduct & Professionalism",
    violations: [
      { code: "1.1", type: "Failure to wear company ID", penalty: "CAP 0", subtypes: [] },
      { code: "1.2", type: "Failure to follow prescribed dress code", penalty: "CAP 0", subtypes: [] },
      { code: "1.3", type: "Failure to maintain cleanliness and orderliness of workstation", penalty: "CAP 0", subtypes: [] },
      { code: "1.4", type: "Inappropriate use of company-issued equipment for personal purposes", penalty: "CAP 0", subtypes: [] },
      { code: "1.5", type: "Loitering or wasting time during working hours", penalty: "CAP 1", subtypes: [] },
      { code: "1.6", type: "Sleeping or dozing off during working hours", penalty: "CAP 1", subtypes: [] },
      { code: "1.7", type: "Engaging in horseplay, practical jokes, or disruptive behavior", penalty: "CAP 1", subtypes: [] },
      { code: "1.8", type: "Failure to report workplace incidents or hazards", penalty: "CAP 1", subtypes: [] },
      { code: "1.9", type: "Unauthorized posting or distribution of materials in company premises", penalty: "CAP 1", subtypes: [] },
      { code: "1.10", type: "Soliciting or selling merchandise within company premises without authorization", penalty: "CAP 1", subtypes: [] },
      { code: "1.11", type: "Gambling within company premises", penalty: "CAP 2", subtypes: [] },
      { code: "1.12", type: "Possession, use, or distribution of illegal drugs or substances within company premises", penalty: "Review for Termination", subtypes: [] },
      { code: "1.13", type: "Reporting to work under the influence of alcohol or illegal substances", penalty: "Review for Termination", subtypes: [] }
    ]
  },
  {
    category: "2. Insubordination & Disrespect",
    violations: [
      { code: "2.1", type: "Failure to follow reasonable work instructions from a supervisor", penalty: "CAP 1", subtypes: [] },
      { code: "2.2", type: "Disrespectful behavior toward colleagues, supervisors, or clients", penalty: "CAP 1", subtypes: [] },
      { code: "2.3", type: "Use of profane, abusive, or threatening language", penalty: "CAP 2", subtypes: [] },
      { code: "2.4", type: "Willful refusal to comply with lawful orders from management", penalty: "CAP 2", subtypes: [] },
      { code: "2.5", type: "Intimidation, coercion, or threatening behavior toward any employee", penalty: "CAP 3", subtypes: [] },
      { code: "2.6", type: "Physical assault or violence against any person within company premises", penalty: "Review for Termination", subtypes: [] }
    ]
  },
  {
    category: "3. Confidentiality & Data Security",
    violations: [
      { code: "3.1", type: "Unauthorized disclosure of non-sensitive company information", penalty: "CAP 1", subtypes: [] },
      { code: "3.2", type: "Failure to secure confidential documents or data", penalty: "CAP 1", subtypes: [] },
      { code: "3.3", type: "Unauthorized access to restricted areas, systems, or files", penalty: "CAP 2", subtypes: [] },
      { code: "3.4", type: "Sharing login credentials or access codes with unauthorized persons", penalty: "CAP 2", subtypes: [] },
      { code: "3.5", type: "Unauthorized disclosure of confidential or proprietary information", penalty: "CAP 3", subtypes: [] },
      { code: "3.6", type: "Deliberate destruction or tampering with company records or data", penalty: "Review for Termination", subtypes: [] }
    ]
  },
  {
    category: "4. Harassment & Discrimination",
    violations: [
      { code: "4.1", type: "Making offensive or insensitive remarks related to protected characteristics", penalty: "CAP 1", subtypes: ["Race or ethnicity", "Gender or gender identity", "Religion or belief", "Age", "Disability", "Sexual orientation", "National origin"] },
      { code: "4.2", type: "Engaging in unwelcome conduct that creates a hostile work environment", penalty: "CAP 2", subtypes: ["Persistent unwelcome jokes or comments", "Displaying offensive materials", "Exclusionary behavior targeting specific individuals or groups"] },
      { code: "4.3", type: "Sexual harassment", penalty: "CAP 3", subtypes: ["Unwelcome sexual advances", "Requests for sexual favors", "Verbal or physical conduct of a sexual nature"] },
      { code: "4.4", type: "Severe or repeated harassment leading to a hostile work environment", penalty: "Review for Termination", subtypes: ["Stalking or persistent unwanted contact", "Threats of retaliation for reporting harassment", "Physical intimidation or assault"] }
    ]
  },
  {
    category: "5. Performance & Productivity",
    violations: [
      { code: "5.1", type: "Failure to meet established performance standards or KPIs", penalty: "CAP 0", subtypes: [] },
      { code: "5.2", type: "Repeated failure to complete assigned tasks within deadlines", penalty: "CAP 1", subtypes: [] },
      { code: "5.3", type: "Negligence resulting in errors, rework, or client complaints", penalty: "CAP 1", subtypes: [] },
      { code: "5.4", type: "Failure to participate in required training or development programs", penalty: "CAP 1", subtypes: [] },
      { code: "5.5", type: "Deliberate underperformance or work slowdown", penalty: "CAP 2", subtypes: [] },
      { code: "5.6", type: "Gross negligence resulting in significant financial loss or reputational damage", penalty: "Review for Termination", subtypes: [] }
    ]
  },
  {
    category: "6. Integrity & Honesty",
    violations: [
      { code: "6.1", type: "Providing false or misleading information", penalty: "CAP 1",
        subtypes: ["Minor inaccuracies in reports or documentation", "Failure to correct known errors in submitted work"] },
      { code: "6.2", type: "Serious acts of dishonesty or fraud", penalty: "Review for Termination",
        subtypes: [
          "6.2.1 Falsification of employment records or credentials",
          "6.2.2 Falsification of time records, attendance, or productivity reports",
          "6.2.3 Theft or misappropriation of company property or funds",
          "6.2.4 Accepting bribes, kickbacks, or unauthorized gifts",
          "6.2.5 Engaging in conflicts of interest without disclosure",
          "6.2.6 Forgery of company documents or signatures",
          "6.2.7 Obtaining company supplies or equipment through fraudulent means"
        ] }
    ]
  },
  {
    category: "7. Attendance Discipline",
    violations: [
      { code: "7.1", type: "Tardiness", penalty: "CAP 0", subtypes: [] },
      { code: "7.2", type: "Unauthorized undertime or extended break", penalty: "CAP 0", subtypes: [] },
      { code: "7.3", type: "Unauthorized Absence", penalty: "CAP 1",
        subtypes: [
          "7.3.1 Absence without prior approval from immediate supervisor",
          "7.3.2 Failure to provide notification within 2-4 hours before shift start"
        ] },
      { code: "7.4", type: "No call No show", penalty: "CAP 2", subtypes: [] },
      { code: "7.5", type: "Absence on identified critical workdays", penalty: "CAP 2", subtypes: [] },
      { code: "7.6", type: "Absconding for three (3) or more days", penalty: "Review for Termination", subtypes: [] }
    ]
  }
];
