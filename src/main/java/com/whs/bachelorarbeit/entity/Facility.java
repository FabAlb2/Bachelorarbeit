package com.whs.bachelorarbeit.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor

@Entity
@Table(
        name = "facilities",
        uniqueConstraints = @UniqueConstraint(columnNames = {"source", "source_key"})
)


public class Facility {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String source; // "kvwl"

    @Column(nullable = false)
    private String sourceKey; // hash aus Adresse

    @Column(nullable = false)
    private String facilityName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FacilityType type; // z.B. ARZTPRAXIS

    private String street;


    private String postalCode;

    private String city;
    private String phone;
    private Double latitude;
    private Double longitude;


    private Boolean wheelchairAccessible;

    @OneToMany(mappedBy = "facility", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Doctor> doctors = new ArrayList<>();


}
