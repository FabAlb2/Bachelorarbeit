package com.whs.bachelorarbeit.entity;


import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
@Entity
@Table(
        name = "district_population",
        uniqueConstraints = @UniqueConstraint(columnNames = {"stichtag", "stadtteil_id"})
)



public class DistrictPopulation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate stichtag;

    @Column(name = "stadtbezirk_id")
    private Integer stadtbezirkId;

    @Column(name = "stadtbezirk_name")
    private String stadtbezirkName;

    @Column(name = "stadtteil_id", nullable = false)
    private Integer stadtteilId;

    @Column(name = "stadtteil_name", nullable = false)
    private String stadtteilName;

    private Integer deutsch;

    @Column(name = "deutsch_mit_2_sta")
    private Integer deutschMit2Sta;

    private Integer nichtdeutsch;

    // GENERATED ALWAYS AS (...) STORED  -> in JPA nur lesen!
    @Column(insertable = false, updatable = false)
    private Integer gesamt;


}
