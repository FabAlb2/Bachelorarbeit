package com.whs.bachelorarbeit.entity;

import jakarta.persistence.*;



@Entity
@Table(
        name = "doctors",
        uniqueConstraints = @UniqueConstraint(columnNames = {"source", "source_key"})
)
public class Doctor {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "facility_id")
    private Facility facility;

    @Column(nullable = false)
    private String source; // "kvwl"

    @Column(name = "source_key", nullable = false)
    private String sourceKey; // KVWL Arzt-ID

    @Column(nullable = false)
    private String name;

    @Column(name = "first_name")
    private String firstName;

    @Column(name = "last_name")
    private String lastName;

    @Column
    private String specialty;
}

