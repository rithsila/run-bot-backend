export enum Role {
    Admin = 'Admin',           // Full control: manage users, courses, payments, settings
    Instructor = 'Instructor', // Can create and manage own courses, view enrolled students
    Student = 'Student',
    Creator = 'Creator'        // Can enroll in and access unlocked courses
}
