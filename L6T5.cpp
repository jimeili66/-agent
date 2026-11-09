#include <iostream>
#include <iomanip>
using namespace std;

bool isValidGrade(char grade) {
    return grade == 'A' || grade == 'B' || grade == 'C' || grade == 'D' || grade == 'F';
}

bool isValidUnit(int unit) {
    return unit == 1 || unit == 3;
}

int gradeToPoint(char grade) {
    if (grade == 'A') {
        return 4;
    }
    if (grade == 'B') {
        return 3;
    }
    if (grade == 'C') {
        return 2;
    }
    if (grade == 'D') {
        return 1;
    }
    return 0;
}

int main() {
    char grade1, grade2, grade3, grade4, grade5, grade6;
    int unit1, unit2, unit3, unit4, unit5, unit6;

    cout << "Please input grade and units for each course (6 courses): ";
    cin >> grade1 >> unit1
        >> grade2 >> unit2
        >> grade3 >> unit3
        >> grade4 >> unit4
        >> grade5 >> unit5
        >> grade6 >> unit6;

    if (!isValidGrade(grade1) || !isValidGrade(grade2) || !isValidGrade(grade3) ||
        !isValidGrade(grade4) || !isValidGrade(grade5) || !isValidGrade(grade6) ||
        !isValidUnit(unit1) || !isValidUnit(unit2) || !isValidUnit(unit3) ||
        !isValidUnit(unit4) || !isValidUnit(unit5) || !isValidUnit(unit6)) {
        cout << "Warning! Invalid grade or unit." << endl;
        return 0;
    }

    int totalPoints =
        gradeToPoint(grade1) * unit1 +
        gradeToPoint(grade2) * unit2 +
        gradeToPoint(grade3) * unit3 +
        gradeToPoint(grade4) * unit4 +
        gradeToPoint(grade5) * unit5 +
        gradeToPoint(grade6) * unit6;

    int totalUnits = unit1 + unit2 + unit3 + unit4 + unit5 + unit6;
    double gpa = static_cast<double>(totalPoints) / totalUnits;

    cout << fixed << setprecision(2);
    cout << "The GPA for this semester is: " << gpa << endl;

    return 0;
}
